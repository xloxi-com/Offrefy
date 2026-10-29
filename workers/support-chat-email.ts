/**
 * Cloudflare Email Worker handler for Support Chat replies.
 * Configure Email Routing on SUPPORT_CHAT_REPLY_DOMAIN to send to this Worker.
 */

import {
  applySupportChatEnvToProcess,
  getReplyDomain,
  getSupportInbox,
  type SupportChatEnv,
} from "../app/utils/supportChat.cloudflare.server";
import { parseReplyLocalPart } from "../app/utils/supportChat.crypto.server";
import {
  extractReplyBody,
  stripHtmlToText,
} from "../app/utils/supportChat.rateLimit.server";
import { resolveEmailReplyKey } from "../app/utils/supportChat.replyIndex.server";
import { postAgentMessageFromEmail } from "../app/utils/supportChat.service.server";

/** Subset of ForwardableEmailMessage used by the handler. */
export type InboundEmailMessage = {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
};

function extractEmailAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  return (angle?.[1] ?? raw).trim().toLowerCase();
}

function extractLocalAndDomain(address: string): {
  local: string;
  domain: string;
} | null {
  const at = address.lastIndexOf("@");
  if (at <= 0) return null;
  return {
    local: address.slice(0, at),
    domain: address.slice(at + 1).toLowerCase(),
  };
}

async function readEmailText(message: InboundEmailMessage): Promise<string> {
  // Prefer text/plain from raw MIME — lightweight parse without a full MIME lib.
  const reader = message.raw.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const max = Math.min(message.rawSize || 256_000, 256_000);
  while (total < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  try {
    reader.releaseLock();
  } catch {
    // ignore
  }

  let length = 0;
  for (const c of chunks) length += c.length;
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(merged);

  const textPart = raw.match(
    /Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\nContent-Type:|$)/i,
  );
  if (textPart?.[1]) {
    return extractReplyBody(textPart[1].replace(/=\r?\n/g, "").trim());
  }
  const htmlPart = raw.match(
    /Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\nContent-Type:|$)/i,
  );
  if (htmlPart?.[1]) {
    return extractReplyBody(stripHtmlToText(htmlPart[1]));
  }
  // Fallback: body after first blank line
  const blank = raw.search(/\r?\n\r?\n/);
  if (blank >= 0) {
    return extractReplyBody(stripHtmlToText(raw.slice(blank).trim()));
  }
  return "";
}

export async function handleSupportChatEmail(
  message: InboundEmailMessage,
  env: SupportChatEnv,
): Promise<void> {
  applySupportChatEnvToProcess(env);

  const replyDomain = getReplyDomain(env);
  const toAddr = extractEmailAddress(message.to || "");
  const parsedTo = extractLocalAndDomain(toAddr);
  if (!parsedTo || parsedTo.domain !== replyDomain) {
    message.setReject("Unknown recipient");
    return;
  }

  const replyId = parseReplyLocalPart(parsedTo.local);
  if (!replyId || !env.SUPPORT_CHAT_R2) {
    message.setReject("Invalid reply address");
    return;
  }

  const payload = await resolveEmailReplyKey(env.SUPPORT_CHAT_R2, replyId);
  if (!payload) {
    message.setReject("Expired or invalid reply key");
    return;
  }

  // Only accept replies from the configured support inbox (or same mailbox domain).
  const fromAddr = extractEmailAddress(message.from || "");
  const inbox = getSupportInbox(env);
  const inboxDomain = inbox.includes("@") ? inbox.split("@")[1]! : "";
  const fromDomain = fromAddr.includes("@") ? fromAddr.split("@")[1]! : "";
  const allowed =
    fromAddr === inbox ||
    (Boolean(inboxDomain) && fromDomain === inboxDomain);
  if (!allowed) {
    console.warn("[support-chat-email] rejected from", fromAddr);
    message.setReject("Sender not allowed");
    return;
  }

  if ((message.rawSize || 0) > 200_000) {
    message.setReject("Message too large");
    return;
  }

  const body = await readEmailText(message);
  if (!body) {
    message.setReject("Empty reply body");
    return;
  }

  const emailMessageId = message.headers.get("Message-ID") || undefined;
  const saved = await postAgentMessageFromEmail(env, {
    conversationId: payload.conversationId,
    shop: payload.shop,
    body,
    emailMessageId: emailMessageId || undefined,
  });

  if (!saved) {
    message.setReject("Failed to store reply");
    return;
  }

  // Successfully handled — do not forward (avoids duplicate inbox noise).
}
