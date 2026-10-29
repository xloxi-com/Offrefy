/**
 * Local Node support-chat flow (shopify app:dev):
 * file store + Hostinger SMTP notify + IMAP reply sync.
 */

import {
  checkInMemoryRateLimit,
  normalizeChatBody,
} from "./supportChat.rateLimit.server";
import { syncImapRepliesIntoLocalStore } from "./supportChat.imap.server";
import {
  appendLocalMessage,
  createLocalReplyKey,
  listLocalMessages,
  localConversationIdForShop,
} from "./supportChat.localStore.server";
import { sendSupportEmail } from "./supportEmail.server";
import type { SupportChatMessage } from "./supportChat.types";

export async function loadLocalConversation(shop: string): Promise<{
  conversationId: string;
  messages: SupportChatMessage[];
}> {
  // Pull any new email replies before returning the thread.
  await syncImapRepliesIntoLocalStore().catch(() => 0);
  const conversationId = localConversationIdForShop(shop);
  const messages = await listLocalMessages(conversationId);
  return { conversationId, messages };
}

export async function postLocalMerchantMessage(input: {
  shop: string;
  rawBody: unknown;
  merchantReplyTo?: string | null;
}): Promise<
  | {
      ok: true;
      message: SupportChatMessage;
      delivered: boolean;
      warning?: string;
    }
  | { ok: false; error: string }
> {
  const body = normalizeChatBody(input.rawBody);
  if (!body) return { ok: false, error: "Message is required." };

  const rate = checkInMemoryRateLimit(input.shop);
  if (!rate.ok) {
    return {
      ok: false,
      error: `Too many messages. Try again in ${rate.retryAfterSec ?? 60}s.`,
    };
  }

  const conversationId = localConversationIdForShop(input.shop);
  const replyKey = await createLocalReplyKey({
    conversationId,
    shop: input.shop,
  });

  const message = await appendLocalMessage({
    conversationId,
    shop: input.shop,
    role: "merchant",
    body,
    source: "admin",
  });

  const emailResult = await sendSupportEmail({
    shop: input.shop,
    message: body,
    replyTo: input.merchantReplyTo,
    replyKey,
  });

  if (!emailResult.ok) {
    return { ok: true, message, delivered: false, warning: emailResult.error };
  }

  return {
    ok: true,
    message,
    delivered: emailResult.delivered,
    ...(emailResult.delivered
      ? {}
      : { warning: emailResult.error }),
  };
}
