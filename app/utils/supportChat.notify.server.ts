import { SUPPORT_EMAIL } from "./supportEmail";
import { buildReplyLocalPart } from "./supportChat.crypto.server";
import {
  getReplyDomain,
  getSupportInbox,
  type SupportChatEnv,
} from "./supportChat.cloudflare.server";
import { createEmailReplyKey } from "./supportChat.replyIndex.server";
import { deliverSupportMail } from "./supportEmail.server";

type NotifyInput = {
  env: SupportChatEnv;
  shop: string;
  conversationId: string;
  message: string;
  merchantReplyTo?: string | null;
};

/**
 * Email Hostinger inbox with Reply-To on the dedicated reply subdomain so
 * agent replies are routed back through the Email Worker → R2 → WebSocket.
 * Also embeds #replyKey in subject for IMAP fallback matching.
 */
export async function notifySupportInbox(
  input: NotifyInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inbox = getSupportInbox(input.env) || SUPPORT_EMAIL;
  const replyDomain = getReplyDomain(input.env);
  const r2 = input.env.SUPPORT_CHAT_R2;
  if (!r2) {
    return { ok: false, error: "Support chat storage is not configured." };
  }
  const replyId = await createEmailReplyKey(r2, {
    conversationId: input.conversationId,
    shop: input.shop,
  });
  const replyToAddress = `${buildReplyLocalPart(replyId)}@${replyDomain}`;

  const subject = `[Offrefy Chat] ${input.shop} #${replyId}`;
  const text = [
    `Shop: ${input.shop}`,
    `Reply to this email to respond in the merchant chat.`,
    `Do not remove the reply address — routing depends on it.`,
    input.merchantReplyTo ? `Merchant contact: ${input.merchantReplyTo}` : null,
    "",
    "— Message —",
    input.message,
  ]
    .filter((line) => line != null)
    .join("\n");

  // Prefer Worker env Resend keys when present.
  if (input.env.RESEND_API_KEY) {
    process.env.RESEND_API_KEY = input.env.RESEND_API_KEY;
  }
  if (input.env.RESEND_FROM_EMAIL) {
    process.env.RESEND_FROM_EMAIL = input.env.RESEND_FROM_EMAIL;
  }

  const result = await deliverSupportMail({
    to: inbox,
    subject,
    text,
    replyTo: replyToAddress,
  });

  if (result.ok && result.delivered) return { ok: true };
  return {
    ok: false,
    error:
      (result.ok ? result.error : result.error) ||
      "Could not send email notification.",
  };
}
