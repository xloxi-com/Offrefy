import type {
  SupportChatMessage,
  SupportChatMeta,
} from "./supportChat.types";
import type { SupportChatR2Bucket } from "./supportChat.cloudflare.server";
import { newMessageId } from "./supportChat.crypto.server";
import { deleteReplyIndexForConversation } from "./supportChat.replyIndex.server";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function conversationPrefix(conversationId: string): string {
  return `conversations/${conversationId}/`;
}

export function metaKey(conversationId: string): string {
  return `${conversationPrefix(conversationId)}meta.json`;
}

export function messageKey(conversationId: string, messageId: string, createdAt: string): string {
  // Lexicographic order ≈ chronological when createdAt is ISO-8601.
  const safeTs = createdAt.replace(/[:.]/g, "-");
  return `${conversationPrefix(conversationId)}messages/${safeTs}_${messageId}.json`;
}

export async function readMeta(
  r2: SupportChatR2Bucket,
  conversationId: string,
): Promise<SupportChatMeta | null> {
  const obj = await r2.get(metaKey(conversationId));
  if (!obj) return null;
  try {
    return await obj.json<SupportChatMeta>();
  } catch {
    return null;
  }
}

export async function writeMeta(
  r2: SupportChatR2Bucket,
  meta: SupportChatMeta,
): Promise<void> {
  await r2.put(metaKey(meta.conversationId), JSON.stringify(meta), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function appendMessage(
  r2: SupportChatR2Bucket,
  input: {
    conversationId: string;
    shop: string;
    role: SupportChatMessage["role"];
    body: string;
    source: SupportChatMessage["source"];
    emailMessageId?: string;
  },
): Promise<SupportChatMessage> {
  const createdAt = new Date().toISOString();
  const id = newMessageId();
  const message: SupportChatMessage = {
    id,
    conversationId: input.conversationId,
    shop: input.shop,
    role: input.role,
    body: input.body,
    createdAt,
    source: input.source,
    ...(input.emailMessageId ? { emailMessageId: input.emailMessageId } : {}),
  };

  const key = messageKey(input.conversationId, id, createdAt);
  await r2.put(key, JSON.stringify(message), {
    httpMetadata: { contentType: "application/json" },
  });

  const existing = await readMeta(r2, input.conversationId);
  const meta: SupportChatMeta = existing
    ? {
        ...existing,
        lastMessageAt: createdAt,
        messageCount: (existing.messageCount ?? 0) + 1,
      }
    : {
        conversationId: input.conversationId,
        shop: input.shop,
        createdAt,
        lastMessageAt: createdAt,
        messageCount: 1,
      };
  await writeMeta(r2, meta);

  return message;
}

export async function listMessages(
  r2: SupportChatR2Bucket,
  conversationId: string,
  options?: { limit?: number },
): Promise<SupportChatMessage[]> {
  const prefix = `${conversationPrefix(conversationId)}messages/`;
  const limit = options?.limit ?? 200;
  const messages: SupportChatMessage[] = [];
  let cursor: string | undefined;

  do {
    const page = await r2.list({ prefix, cursor, limit: 1000 });
    for (const obj of page.objects) {
      const got = await r2.get(obj.key);
      if (!got) continue;
      try {
        messages.push(await got.json<SupportChatMessage>());
      } catch {
        // skip corrupt object
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (messages.length > limit) {
    return messages.slice(messages.length - limit);
  }
  return messages;
}

export async function deleteConversation(
  r2: SupportChatR2Bucket,
  conversationId: string,
): Promise<number> {
  await deleteReplyIndexForConversation(r2, conversationId).catch(() => {});
  const prefix = conversationPrefix(conversationId);
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await r2.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map((o) => o.key);
    if (keys.length > 0) {
      await r2.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

export async function cleanupInactiveConversations(
  r2: SupportChatR2Bucket,
  now = Date.now(),
): Promise<{ scanned: number; deletedConversations: number; deletedObjects: number }> {
  // List meta files under conversations/*/meta.json via prefix scan of conversations/
  let scanned = 0;
  let deletedConversations = 0;
  let deletedObjects = 0;
  let cursor: string | undefined;

  const metaKeys: string[] = [];
  do {
    const page = await r2.list({ prefix: "conversations/", cursor, limit: 1000 });
    for (const obj of page.objects) {
      if (obj.key.endsWith("/meta.json")) metaKeys.push(obj.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  for (const key of metaKeys) {
    scanned += 1;
    const obj = await r2.get(key);
    if (!obj) continue;
    let meta: SupportChatMeta;
    try {
      meta = await obj.json<SupportChatMeta>();
    } catch {
      continue;
    }
    const last = Date.parse(meta.lastMessageAt);
    if (!Number.isFinite(last)) continue;
    if (now - last < RETENTION_MS) continue;

    const n = await deleteConversation(r2, meta.conversationId);
    deletedConversations += 1;
    deletedObjects += n;
  }

  return { scanned, deletedConversations, deletedObjects };
}

/** Count merchant messages in the last windowMs (for rate limiting). */
export async function countRecentMerchantMessages(
  r2: SupportChatR2Bucket,
  conversationId: string,
  windowMs: number,
): Promise<number> {
  const since = Date.now() - windowMs;
  const messages = await listMessages(r2, conversationId, { limit: 50 });
  return messages.filter(
    (m) =>
      m.role === "merchant" &&
      Date.parse(m.createdAt) >= since,
  ).length;
}
