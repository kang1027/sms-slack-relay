import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/config/env";
import { getSmsGatewayClient } from "@/lib/sms-gateway/client";
import { getSlackClient } from "@/lib/slack/client";
import {
  buildHealthAlertMessage,
  buildHealthRecoveryMessage,
} from "@/lib/slack/messages/health-alert";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";
type DeviceStatus = "ok" | "stale" | "error";

interface HealthChecks {
  mysql: CheckStatus;
  smsGateway: CheckStatus;
  device: DeviceStatus;
}

async function runHealthChecks(env: ReturnType<typeof getEnv>): Promise<{
  checks: HealthChecks;
  deviceLastSeen: Date | null;
  deviceMinutesAgo: number | null;
}> {
  const checks: HealthChecks = {
    mysql: "error",
    smsGateway: "error",
    device: "error",
  };
  let deviceLastSeen: Date | null = null;
  let deviceMinutesAgo: number | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.mysql = "ok";
  } catch (error) {
    logger.error({ error }, "Health check: MySQL 연결 실패");
  }

  try {
    const res = await fetch(`${env.SMS_GATEWAY_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) checks.smsGateway = "ok";
  } catch (error) {
    logger.error({ error }, "Health check: SMS Gateway 응답 없음");
  }

  try {
    const smsClient = getSmsGatewayClient();
    const device = await smsClient.getDevice();
    deviceLastSeen = new Date(device.lastSeen);
    deviceMinutesAgo = Math.floor(
      (Date.now() - deviceLastSeen.getTime()) / (1000 * 60)
    );

    if (deviceMinutesAgo <= env.HEALTH_CHECK_DEVICE_THRESHOLD_MINUTES) {
      checks.device = "ok";
    } else {
      checks.device = "stale";
    }
  } catch (error) {
    logger.error({ error }, "Health check: 기기 상태 조회 실패");
  }

  return { checks, deviceLastSeen, deviceMinutesAgo };
}

function isHealthy(checks: HealthChecks): boolean {
  return checks.mysql === "ok" && checks.smsGateway === "ok" && checks.device === "ok";
}

export async function GET(request: NextRequest) {
  const env = getEnv();

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (token !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { checks, deviceLastSeen, deviceMinutesAgo } = await runHealthChecks(env);
  const currentlyHealthy = isHealthy(checks);

  const lastLog = await prisma.healthCheckLog.findFirst({
    orderBy: { createdAt: "desc" },
  });

  const wasHealthy = lastLog
    ? lastLog.mysqlStatus === "ok" &&
      lastLog.gatewayStatus === "ok" &&
      lastLog.deviceStatus === "ok"
    : true;

  const currentLog = await prisma.healthCheckLog.create({
    data: {
      mysqlStatus: checks.mysql,
      gatewayStatus: checks.smsGateway,
      deviceStatus: checks.device,
      deviceLastSeen,
      alertSent: false,
    },
  });

  const slackClient = getSlackClient();

  // 정상 → 장애: 알림 발송
  if (wasHealthy && !currentlyHealthy) {
    const message = buildHealthAlertMessage({
      checks,
      device:
        deviceMinutesAgo !== null && deviceLastSeen
          ? { lastSeen: deviceLastSeen.toISOString(), minutesAgo: deviceMinutesAgo }
          : undefined,
    });

    try {
      await slackClient.chat.postMessage({
        channel: env.SLACK_CHANNEL_CS_SMS,
        ...message,
      });

      await prisma.healthCheckLog.update({
        where: { id: currentLog.id },
        data: { alertSent: true },
      });

      logger.info({ checks }, "장애 알림 발송 완료");
    } catch (error) {
      logger.error({ error }, "장애 알림 발송 실패");
    }
  } else if (!wasHealthy && currentlyHealthy) {
    // 장애 → 정상: 복구 알림 (이번 장애 구간의 시작점 조회)
    const lastHealthyLog = await prisma.healthCheckLog.findFirst({
      where: {
        mysqlStatus: "ok",
        gatewayStatus: "ok",
        deviceStatus: "ok",
      },
      orderBy: { createdAt: "desc" },
      skip: 1, // 방금 생성한 현재(정상) 로그 제외
    });

    const firstFailOfIncident = lastHealthyLog
      ? await prisma.healthCheckLog.findFirst({
          where: {
            createdAt: { gt: lastHealthyLog.createdAt },
            OR: [
              { mysqlStatus: { not: "ok" } },
              { gatewayStatus: { not: "ok" } },
              { deviceStatus: { not: "ok" } },
            ],
          },
          orderBy: { createdAt: "asc" },
        })
      : await prisma.healthCheckLog.findFirst({
          where: {
            OR: [
              { mysqlStatus: { not: "ok" } },
              { gatewayStatus: { not: "ok" } },
              { deviceStatus: { not: "ok" } },
            ],
          },
          orderBy: { createdAt: "asc" },
        });

    const now = new Date();
    const downStartedAt = firstFailOfIncident?.createdAt ?? now;
    const downMinutes = firstFailOfIncident
      ? Math.floor((now.getTime() - firstFailOfIncident.createdAt.getTime()) / (1000 * 60))
      : 0;

    const message = buildHealthRecoveryMessage({
      downStartedAt,
      recoveredAt: now,
      downDurationMinutes: downMinutes,
    });

    try {
      await slackClient.chat.postMessage({
        channel: env.SLACK_CHANNEL_CS_SMS,
        ...message,
      });

      logger.info({ downMinutes }, "복구 알림 발송 완료");
    } catch (error) {
      logger.error({ error }, "복구 알림 발송 실패");
    }
  }

  // 오래된 로그 정리 (7일 이상)
  await prisma.healthCheckLog.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  return NextResponse.json({
    status: currentlyHealthy ? "healthy" : "unhealthy",
    checks,
    stateChanged: wasHealthy !== currentlyHealthy,
    timestamp: new Date().toISOString(),
  });
}
