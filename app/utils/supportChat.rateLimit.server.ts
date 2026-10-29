/**
 * In-isolate sliding-window rate limit + R2-backed recent-message check.
 * Isolate Map is best-effort spam protection; R2 count is the durable backstop.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

const MAX_PER_WINDOW = 8;
const WINDOW_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 2_000;
const MAX_BODY_CHARS = 4_000;

export const SUPPORT_CHAT_LIMITS = {
  maxPerWindow: MAX_PER_WINDOW,
  windowMs: WINDOW_MS,
  minIntervalMs: MIN_INTERVAL_MS,
  maxBodyChars: MAX_BODY_CHARS,
} as const;

export function normalizeChatBody(raw: unknown): string | null {
  const text = String(raw ?? "")
    .replace(/\0/g, "")
    .trim();
  if (!text) return null;
  // Reject obvious spam patterns (URL floods).
  const urlCount = (text.match(/https?:\/\//gi) ?? []).length;
  if (urlCount > 3) return null;
  if (text.length > MAX_BODY_CHARS) return text.slice(0, MAX_BODY_CHARS);
  return text;
}

export function checkInMemoryRateLimit(shop: string): {
  ok: boolean;
  retryAfterSec?: number;
} {
  const key = shop.trim().toLowerCase();
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);
  const last = bucket.timestamps[bucket.timestamps.length - 1];
  if (last != null && now - last < MIN_INTERVAL_MS) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((MIN_INTERVAL_MS - (now - last)) / 1000),
    };
  }
  if (bucket.timestamps.length >= MAX_PER_WINDOW) {
    const oldest = bucket.timestamps[0]!;
    return {
      ok: false,
      retryAfterSec: Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
    };
  }

  bucket.timestamps.push(now);
  return { ok: true };
}

/** Simple HTML → plain text for inbound email bodies. */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drop quoted reply chains from common email clients. */
export function extractReplyBody(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From:\s+/i.test(line.trim()) && kept.length > 0) break;
    if (/^_{5,}$/.test(line.trim())) break;
    if (/^>+/.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}
