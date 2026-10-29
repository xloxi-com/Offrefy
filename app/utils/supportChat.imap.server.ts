/**
 * Poll Hostinger IMAP for agent replies to Offrefy Chat emails.
 * Matches subject `[Offrefy Chat] … #{replyKey}` and appends to local store.
 */

import {
  appendLocalMessage,
  parseOffrefyChatSubject,
  resolveLocalReplyKey,
} from "./supportChat.localStore.server";
import {
  extractReplyBody,
  stripHtmlToText,
} from "./supportChat.rateLimit.server";

function isCloudflareWorker(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

export function imapConfigured(): boolean {
  if (isCloudflareWorker()) return false;
  const user = (process.env.SUPPORT_IMAP_USER ?? process.env.SUPPORT_SMTP_USER ?? process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SUPPORT_IMAP_PASS ?? process.env.SUPPORT_SMTP_PASS ?? process.env.SMTP_PASS ?? "").trim();
  return Boolean(user && pass);
}

type FetchedReply = {
  messageId: string;
  subject: string;
  text: string;
};

let pollInflight: Promise<number> | null = null;
let lastPollAt = 0;
const MIN_POLL_GAP_MS = 8_000;

async function fetchRecentReplies(): Promise<FetchedReply[]> {
  if (!imapConfigured()) return [];

  const host =
    (process.env.SUPPORT_IMAP_HOST ?? process.env.IMAP_HOST ?? "").trim() ||
    "imap.hostinger.com";
  const port = Number(
    process.env.SUPPORT_IMAP_PORT ?? process.env.IMAP_PORT ?? "993",
  );
  const user = (
    process.env.SUPPORT_IMAP_USER ??
    process.env.SUPPORT_SMTP_USER ??
    process.env.SMTP_USER ??
    ""
  ).trim();
  const pass = (
    process.env.SUPPORT_IMAP_PASS ??
    process.env.SUPPORT_SMTP_PASS ??
    process.env.SMTP_PASS ??
    ""
  ).trim();

  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const out: FetchedReply[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Last 40 messages — enough for active support threads.
      const status = await client.status("INBOX", { messages: true });
      const total = status.messages ?? 0;
      if (total === 0) return out;
      const from = Math.max(1, total - 39);
      for await (const msg of client.fetch(`${from}:*`, {
        envelope: true,
        source: true,
        uid: true,
      })) {
        const subject = String(msg.envelope?.subject ?? "");
        if (!/\[Offrefy Chat\]/i.test(subject)) continue;
        // Skip the original outbound copy; only import human replies.
        const isReply = /^(re|fw|fwd)\s*:/i.test(subject.trim());
        if (!isReply) continue;

        let raw = "";
        if (msg.source) {
          raw =
            typeof msg.source === "string"
              ? msg.source
              : Buffer.from(msg.source).toString("utf8");
        }
        const text = extractTextFromMime(raw);
        if (!text) continue;
        const messageId =
          String(msg.envelope?.messageId ?? "") ||
          `imap-${msg.uid ?? Date.now()}`;
        out.push({ messageId, subject, text });
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    console.warn("[support-chat] IMAP poll failed", error);
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
  return out;
}

function extractTextFromMime(raw: string): string {
  const textPart = raw.match(
    /Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\nContent-Type:|$)/i,
  );
  if (textPart?.[1]) {
    return extractReplyBody(
      textPart[1]
        .replace(/=\r?\n/g, "")
        .replace(/=\r?\n/g, "")
        .trim(),
    );
  }
  const htmlPart = raw.match(
    /Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\nContent-Type:|$)/i,
  );
  if (htmlPart?.[1]) {
    return extractReplyBody(stripHtmlToText(htmlPart[1]));
  }
  const blank = raw.search(/\r?\n\r?\n/);
  if (blank >= 0) {
    return extractReplyBody(stripHtmlToText(raw.slice(blank).trim()));
  }
  return extractReplyBody(raw);
}

/**
 * Import new agent replies from IMAP into the local conversation store.
 * Returns number of new messages appended.
 */
export async function syncImapRepliesIntoLocalStore(): Promise<number> {
  if (!imapConfigured()) return 0;
  const now = Date.now();
  if (now - lastPollAt < MIN_POLL_GAP_MS && pollInflight) {
    return pollInflight;
  }
  if (pollInflight) return pollInflight;

  pollInflight = (async () => {
    lastPollAt = Date.now();
    let added = 0;
    const replies = await fetchRecentReplies();
    for (const reply of replies) {
      const replyKey = parseOffrefyChatSubject(reply.subject);
      if (!replyKey) continue;
      const mapped = await resolveLocalReplyKey(replyKey);
      if (!mapped) continue;

      // Deduplicate by email Message-ID stored on previous messages.
      const { listLocalMessages } = await import(
        "./supportChat.localStore.server"
      );
      const existing = await listLocalMessages(mapped.conversationId);
      if (existing.some((m) => m.emailMessageId === reply.messageId)) {
        continue;
      }

      const body = reply.text.trim();
      if (!body) continue;

      await appendLocalMessage({
        conversationId: mapped.conversationId,
        shop: mapped.shop,
        role: "agent",
        body,
        source: "email",
        emailMessageId: reply.messageId,
      });
      added += 1;
    }
    return added;
  })().finally(() => {
    pollInflight = null;
  });

  return pollInflight;
}
