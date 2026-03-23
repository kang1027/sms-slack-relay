import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const ts = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const expected = "v0=" + createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  try {
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

export async function parseSlackRequest(
  request: NextRequest
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Slack payload 구조가 action type별로 상이
): Promise<{ body: string; params: URLSearchParams; payload?: any } | NextResponse> {
  const body = await request.text();
  const env = getEnv();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  // 서명 검증을 retry 체크보다 먼저 수행 — 인증 우회 방지
  if (!verifySlackSignature(env.SLACK_SIGNING_SECRET, signature, timestamp, body)) {
    logger.warn("Slack 서명 검증 실패");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 서명 검증 통과 후 retry 체크
  const retryNum = request.headers.get("x-slack-retry-num");
  if (retryNum && Number(retryNum) > 0) {
    return NextResponse.json({ ok: true });
  }

  const params = new URLSearchParams(body);
  const payloadStr = params.get("payload");
  let payload: unknown;
  if (payloadStr) {
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      logger.warn("Slack payload JSON 파싱 실패");
    }
  }

  return { body, params, payload };
}
