import type { SupportChatMessage } from "./supportChat.types";
import {
  applySupportChatEnvToProcess,
  type SupportChatEnv,
} from "./supportChat.cloudflare.server";
import {
  conversationIdForShop,
  mintChatToken,
} from "./supportChat.crypto.server";
import {
  appendMessage,
  countRecentMerchantMessages,
  listMessages,
} from "./supportChat.r2.server";
import {
  checkInMemoryRateLimit,
  normalizeChatBody,
  SUPPORT_CHAT_LIMITS,
} from "./supportChat.rateLimit.server";
import { notifySupportInbox } from "./supportChat.notify.server";

export async function broadcastToChatRoom(
  env: SupportChatEnv,
  conversationId: string,
  message: SupportChatMessage,
): Promise<void> {
  const ns = env.SUPPORT_CHAT_ROOM;
  if (!ns) return;
  try {
    const id = ns.idFromName(conversationId);
    const stub = ns.get(id);
    await stub.fetch(
      new Request("https://support-chat-room/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "message", message }),
      }),
    );
  } catch (error) {
    console.warn("[support-chat] broadcast failed", error);
  }
}

export async function loadConversationForShop(
  env: SupportChatEnv,
  shop: string,
): Promise<
  | {
      ok: true;
      conversationId: string;
      token: string;
      messages: SupportChatMessage[];
      realtime: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  applySupportChatEnvToProcess(env);
  const r2 = env.SUPPORT_CHAT_R2;
  if (!r2) {
    return {
      ok: false,
      error: "Support chat storage is not configured.",
      status: 503,
    };
  }
  const conversationId = await conversationIdForShop(shop);
  const token = await mintChatToken({ conversationId, shop });
  const messages = await listMessages(r2, conversationId);
  return {
    ok: true,
    conversationId,
    token,
    messages,
    realtime: Boolean(env.SUPPORT_CHAT_ROOM),
  };
}

export async function postMerchantMessage(
  env: SupportChatEnv,
  input: {
    shop: string;
    rawBody: unknown;
    merchantReplyTo?: string | null;
  },
): Promise<
  | { ok: true; message: SupportChatMessage; token: string }
  | { ok: false; error: string; status: number }
> {
  applySupportChatEnvToProcess(env);
  const r2 = env.SUPPORT_CHAT_R2;
  if (!r2) {
    return {
      ok: false,
      error: "Support chat storage is not configured.",
      status: 503,
    };
  }

  const body = normalizeChatBody(input.rawBody);
  if (!body) {
    return { ok: false, error: "Message is required.", status: 400 };
  }

  const rate = checkInMemoryRateLimit(input.shop);
  if (!rate.ok) {
    return {
      ok: false,
      error: `Too many messages. Try again in ${rate.retryAfterSec ?? 60}s.`,
      status: 429,
    };
  }

  const conversationId = await conversationIdForShop(input.shop);
  const recent = await countRecentMerchantMessages(
    r2,
    conversationId,
    SUPPORT_CHAT_LIMITS.windowMs,
  );
  if (recent >= SUPPORT_CHAT_LIMITS.maxPerWindow) {
    return {
      ok: false,
      error: "Too many messages. Please wait a few minutes.",
      status: 429,
    };
  }

  const message = await appendMessage(r2, {
    conversationId,
    shop: input.shop,
    role: "merchant",
    body,
    source: "admin",
  });

  await broadcastToChatRoom(env, conversationId, message);

  // Email notify — do not fail the chat write if email fails.
  const notify = await notifySupportInbox({
    env,
    shop: input.shop,
    conversationId,
    message: body,
    merchantReplyTo: input.merchantReplyTo,
  });
  if (!notify.ok) {
    console.warn("[support-chat] notify failed", notify.error);
  }

  const token = await mintChatToken({ conversationId, shop: input.shop });
  return { ok: true, message, token };
}

export async function postAgentMessageFromEmail(
  env: SupportChatEnv,
  input: {
    conversationId: string;
    shop: string;
    body: string;
    emailMessageId?: string;
  },
): Promise<SupportChatMessage | null> {
  applySupportChatEnvToProcess(env);
  const r2 = env.SUPPORT_CHAT_R2;
  if (!r2) return null;

  const body = normalizeChatBody(input.body);
  if (!body) return null;

  const message = await appendMessage(r2, {
    conversationId: input.conversationId,
    shop: input.shop,
    role: "agent",
    body,
    source: "email",
    emailMessageId: input.emailMessageId,
  });
  await broadcastToChatRoom(env, input.conversationId, message);
  return message;
}
