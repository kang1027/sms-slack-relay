import { getSlackClient } from "@/lib/slack/client";
import { prisma } from "@/lib/db/prisma";
import { formatPhoneNumber, normalizePhoneNumber } from "@/lib/utils/phone";
import { logger } from "@/lib/logger";

export async function handleRegisterContact(payload: any) {
  const action = payload.actions?.[0];
  const triggerId = payload.trigger_id;
  if (!action?.value || !triggerId) return;

  let phoneNumber: string;
  try {
    const parsed = JSON.parse(action.value);
    phoneNumber = parsed.phoneNumber;
  } catch {
    logger.warn("연락처 등록 action value 파싱 실패");
    return;
  }

  const slackClient = getSlackClient();

  await slackClient.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "register_contact_modal",
      private_metadata: JSON.stringify({ phoneNumber }),
      title: { type: "plain_text", text: "연락처 등록" },
      submit: { type: "plain_text", text: "등록" },
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*전화번호:* ${formatPhoneNumber(phoneNumber)}` },
        },
        {
          type: "input",
          block_id: "name_block",
          label: { type: "plain_text", text: "이름" },
          element: { type: "plain_text_input", action_id: "name_input" },
        },
        {
          type: "input",
          block_id: "memo_block",
          label: { type: "plain_text", text: "메모" },
          optional: true,
          element: { type: "plain_text_input", action_id: "memo_input" },
        },
      ],
    },
  });
}

export async function handleRegisterContactSubmission(payload: any) {
  let phoneNumber: string;
  try {
    const parsed = JSON.parse(payload.view?.private_metadata ?? "");
    phoneNumber = normalizePhoneNumber(parsed.phoneNumber) ?? parsed.phoneNumber;
  } catch {
    return {
      response_action: "errors" as const,
      errors: { name_block: "잘못된 요청입니다. 다시 시도해주세요." },
    };
  }

  const name = payload.view?.state?.values?.name_block?.name_input?.value;
  const memo = payload.view?.state?.values?.memo_block?.memo_input?.value ?? null;

  if (!name) {
    return {
      response_action: "errors" as const,
      errors: { name_block: "이름을 입력하세요" },
    };
  }

  try {
    await prisma.contact.create({
      data: { phoneNumber, name, memo },
    });
    logger.info({ phoneNumber, name }, "연락처 등록 완료");
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as any).code === "P2002") {
      return {
        response_action: "errors" as const,
        errors: { name_block: "이미 등록된 번호입니다" },
      };
    }
    throw error;
  }

  return null;
}
