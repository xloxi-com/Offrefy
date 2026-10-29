/**
 * Short reply keys for email Plus-addressing (local-part ≤ ~64 chars).
 * Full signed chat tokens remain for WebSocket/UI; email uses R2 lookup.
 */

import type { SupportChatR2Bucket } from "./supportChat.cloudflare.server";

const EMAIL_REPLY_TTL_SECONDS = 60 * 60 * 24 * 30;

export type ReplyIndexRecord = {
  conversationId: string;
  shop: string;
  exp: number;
};

function randomReplyId(): string {
  // Hex only — MTAs often lowercase the local-part; base64url would break.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function replyIndexKey(replyId: string): string {
  return `reply-index/${replyId}.json`;
}

export async function createEmailReplyKey(
  r2: SupportChatR2Bucket,
  input: { conversationId: string; shop: string },
): Promise<string> {
  const replyId = randomReplyId();
  const record: ReplyIndexRecord = {
    conversationId: input.conversationId,
    shop: input.shop.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + EMAIL_REPLY_TTL_SECONDS,
  };
  await r2.put(replyIndexKey(replyId), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
  });
  // Also keep latest pointer on the conversation for cleanup.
  await r2.put(
    `conversations/${input.conversationId}/reply-key.json`,
    JSON.stringify({ replyId, ...record }),
    { httpMetadata: { contentType: "application/json" } },
  );
  return replyId;
}

export async function resolveEmailReplyKey(
  r2: SupportChatR2Bucket,
  replyId: string,
): Promise<ReplyIndexRecord | null> {
  const obj = await r2.get(replyIndexKey(replyId));
  if (!obj) return null;
  try {
    const record = await obj.json<ReplyIndexRecord>();
    if (!record?.conversationId || !record?.shop || typeof record.exp !== "number") {
      return null;
    }
    if (record.exp < Math.floor(Date.now() / 1000)) return null;
    return record;
  } catch {
    return null;
  }
}

/** Delete reply-index entries discovered while wiping a conversation. */
export async function deleteReplyIndexForConversation(
  r2: SupportChatR2Bucket,
  conversationId: string,
): Promise<void> {
  const pointer = await r2.get(`conversations/${conversationId}/reply-key.json`);
  if (!pointer) return;
  try {
    const data = await pointer.json<{ replyId?: string }>();
    if (data?.replyId) {
      await r2.delete(replyIndexKey(data.replyId));
    }
  } catch {
    // ignore
  }
}
