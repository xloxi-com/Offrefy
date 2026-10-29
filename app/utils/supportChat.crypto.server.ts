/**
 * Signed conversation tokens — never expose raw conversation IDs to the client
 * or in email without an HMAC. Token format: base64url(payload).base64url(sig)
 * payload = JSON { cid, shop, exp }
 */

const TEXT = new TextEncoder();

function getSecret(): string {
  const secret =
    (process.env.SUPPORT_CHAT_HMAC_SECRET ?? "").trim() ||
    (process.env.SHOPIFY_API_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("SUPPORT_CHAT_HMAC_SECRET (or SHOPIFY_API_SECRET) is required");
  }
  return secret;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    TEXT.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, TEXT.encode(data));
  return toBase64Url(sig);
}

async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i)! ^ signature.charCodeAt(i)!;
  }
  return mismatch === 0;
}

/** Deterministic conversation id from shop domain (not shown raw to clients). */
export async function conversationIdForShop(shop: string): Promise<string> {
  const normalized = shop.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", TEXT.encode(`vd-chat:${normalized}`));
  return toBase64Url(digest).slice(0, 32);
}

export type SignedChatTokenPayload = {
  cid: string;
  shop: string;
  exp: number;
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 12; // 12h for WS / UI
const EMAIL_REPLY_TTL_SECONDS = 60 * 60 * 24 * 30; // 30d for email reply mapping

export async function mintChatToken(input: {
  conversationId: string;
  shop: string;
  ttlSeconds?: number;
}): Promise<string> {
  const payload: SignedChatTokenPayload = {
    cid: input.conversationId,
    shop: input.shop.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  const body = toBase64Url(TEXT.encode(JSON.stringify(payload)));
  const sig = await hmacSign(body);
  return `${body}.${sig}`;
}

export async function mintEmailReplyToken(input: {
  conversationId: string;
  shop: string;
}): Promise<string> {
  return mintChatToken({
    ...input,
    ttlSeconds: EMAIL_REPLY_TTL_SECONDS,
  });
}

export async function verifyChatToken(
  token: string,
): Promise<SignedChatTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  if (!(await hmacVerify(body, sig))) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(body));
    const payload = JSON.parse(json) as SignedChatTokenPayload;
    if (!payload?.cid || !payload?.shop || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      cid: String(payload.cid),
      shop: String(payload.shop).toLowerCase(),
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Local-part for Reply-To: reply+{replyId}@{domain} (hex replyId is case-safe). */
export function buildReplyLocalPart(replyId: string): string {
  return `reply+${replyId}`;
}

export function parseReplyLocalPart(localPart: string): string | null {
  const match = localPart.trim().match(/^reply\+([a-f0-9]+)$/i);
  if (!match?.[1]) return null;
  return match[1].toLowerCase();
}

export function newMessageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
