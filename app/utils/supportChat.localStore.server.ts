/**
 * Local (Node) conversation store for `shopify app:dev`.
 * Files live under OS temp (or SUPPORT_CHAT_DATA_DIR) — never inside the app repo.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { SupportChatMessage, SupportChatMeta } from "./supportChat.types";

function dataRoot(): string {
  const fromEnv = (process.env.SUPPORT_CHAT_DATA_DIR ?? "").trim();
  if (fromEnv) return fromEnv;
  return join(tmpdir(), "offrefy-support-chat");
}

export function localConversationIdForShop(shop: string): string {
  return createHash("sha256")
    .update(`vd-chat:${shop.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

function conversationDir(conversationId: string): string {
  return join(dataRoot(), "conversations", conversationId);
}

function messagesDir(conversationId: string): string {
  return join(conversationDir(conversationId), "messages");
}

function metaPath(conversationId: string): string {
  return join(conversationDir(conversationId), "meta.json");
}

function replyMapPath(): string {
  return join(dataRoot(), "reply-map.json");
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

export async function readLocalMeta(
  conversationId: string,
): Promise<SupportChatMeta | null> {
  try {
    const raw = await readFile(metaPath(conversationId), "utf8");
    return JSON.parse(raw) as SupportChatMeta;
  } catch {
    return null;
  }
}

async function writeLocalMeta(meta: SupportChatMeta) {
  await ensureDir(conversationDir(meta.conversationId));
  await writeFile(metaPath(meta.conversationId), JSON.stringify(meta, null, 2), "utf8");
}

export async function listLocalMessages(
  conversationId: string,
): Promise<SupportChatMessage[]> {
  const dir = messagesDir(conversationId);
  try {
    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".json"))
      .sort();
    const out: SupportChatMessage[] = [];
    for (const file of files) {
      try {
        const raw = await readFile(join(dir, file), "utf8");
        out.push(JSON.parse(raw) as SupportChatMessage);
      } catch {
        // skip corrupt
      }
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function appendLocalMessage(input: {
  conversationId: string;
  shop: string;
  role: SupportChatMessage["role"];
  body: string;
  source: SupportChatMessage["source"];
  emailMessageId?: string;
}): Promise<SupportChatMessage> {
  const createdAt = new Date().toISOString();
  const id = randomBytes(8).toString("hex");
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

  await ensureDir(messagesDir(input.conversationId));
  const safeTs = createdAt.replace(/[:.]/g, "-");
  await writeFile(
    join(messagesDir(input.conversationId), `${safeTs}_${id}.json`),
    JSON.stringify(message, null, 2),
    "utf8",
  );

  const existing = await readLocalMeta(input.conversationId);
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
  await writeLocalMeta(meta);
  return message;
}

type ReplyMap = Record<
  string,
  { conversationId: string; shop: string; exp: number }
>;

async function readReplyMap(): Promise<ReplyMap> {
  try {
    const raw = await readFile(replyMapPath(), "utf8");
    return JSON.parse(raw) as ReplyMap;
  } catch {
    return {};
  }
}

async function writeReplyMap(map: ReplyMap) {
  await ensureDir(dataRoot());
  await writeFile(replyMapPath(), JSON.stringify(map, null, 2), "utf8");
}

/** Short hex key embedded in email subject for reply routing without CF Email Worker. */
export async function createLocalReplyKey(input: {
  conversationId: string;
  shop: string;
}): Promise<string> {
  const replyId = randomBytes(8).toString("hex");
  const map = await readReplyMap();
  map[replyId] = {
    conversationId: input.conversationId,
    shop: input.shop.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
  await writeReplyMap(map);
  await ensureDir(conversationDir(input.conversationId));
  await writeFile(
    join(conversationDir(input.conversationId), "reply-key.json"),
    JSON.stringify({ replyId, ...map[replyId] }, null, 2),
    "utf8",
  );
  return replyId;
}

export async function resolveLocalReplyKey(
  replyId: string,
): Promise<{ conversationId: string; shop: string } | null> {
  const map = await readReplyMap();
  const rec = map[replyId.toLowerCase()] ?? map[replyId];
  if (!rec) return null;
  if (rec.exp < Math.floor(Date.now() / 1000)) return null;
  return { conversationId: rec.conversationId, shop: rec.shop };
}

export function parseOffrefyChatSubject(subject: string): string | null {
  // [Offrefy Chat] shop.myshopify.com #abcdef12
  const match = subject.match(/\[Offrefy Chat\][^\n#]*#([a-f0-9]{8,32})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export async function purgeExpiredLocalConversations(
  now = Date.now(),
): Promise<number> {
  const root = join(dataRoot(), "conversations");
  let deleted = 0;
  try {
    const ids = await readdir(root);
    for (const id of ids) {
      const meta = await readLocalMeta(id);
      if (!meta) continue;
      const last = Date.parse(meta.lastMessageAt);
      if (!Number.isFinite(last) || now - last < 30 * 24 * 60 * 60 * 1000) {
        continue;
      }
      const dir = conversationDir(id);
      const files = await readdir(dir).catch(() => [] as string[]);
      for (const f of files) {
        if (f === "messages") {
          const msgs = await readdir(messagesDir(id)).catch(() => [] as string[]);
          for (const m of msgs) {
            await unlink(join(messagesDir(id), m)).catch(() => {});
          }
        } else {
          await unlink(join(dir, f)).catch(() => {});
        }
      }
      deleted += 1;
    }
  } catch {
    // ignore
  }
  return deleted;
}
