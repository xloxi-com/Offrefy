import crypto from "node:crypto";
import { sessionStorage } from "../shopify.server";

/**
 * Authenticates an incoming Shopify webhook with HMAC-SHA256 verification.
 *
 * Critical: uses the raw, unparsed request body (request.text()). Verifying
 * against a re-serialized JSON body will fail Shopify's signature check.
 *
 * Invalid / missing HMAC → HTTP 401 (thrown Response). Does not process payload.
 */
export async function authenticateShopifyWebhook(request: Request) {
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader) {
    console.error("[webhooks] Missing X-Shopify-Hmac-Sha256 header", {
      url: request.url,
      method: request.method,
    });
    throw new Response("Unauthorized", { status: 401 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("[webhooks] SHOPIFY_API_SECRET is not configured");
    throw new Response("Unauthorized", { status: 401 });
  }

  // Raw body required for HMAC — do not use a previously JSON-parsed body.
  const rawBody = await request.text();

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const digestBuffer = Buffer.from(digest, "base64");
  let headerBuffer: Buffer;
  try {
    headerBuffer = Buffer.from(hmacHeader, "base64");
  } catch {
    console.error("[webhooks] Invalid X-Shopify-Hmac-Sha256 encoding");
    throw new Response("Unauthorized", { status: 401 });
  }

  // timingSafeEqual throws if lengths differ — reject first, then compare.
  if (
    digestBuffer.length !== headerBuffer.length ||
    !crypto.timingSafeEqual(digestBuffer, headerBuffer)
  ) {
    console.error("[webhooks] HMAC verification failed", {
      url: request.url,
      method: request.method,
      status: 401,
    });
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = request.headers.get("X-Shopify-Shop-Domain") ?? "";
  const topicHeader = request.headers.get("X-Shopify-Topic") ?? "";
  // Normalize to APP_UNINSTALLED / CUSTOMERS_DATA_REQUEST style.
  const topic = topicHeader.toUpperCase().replace(/\//g, "_");

  let payload: Record<string, unknown> = {};
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new Response("Bad Request", { status: 400 });
    }
  }

  let session: Awaited<
    ReturnType<typeof sessionStorage.findSessionsByShop>
  >[number] | undefined;
  if (shop) {
    const sessions = await sessionStorage.findSessionsByShop(shop);
    session = sessions[0];
  }

  return { shop, topic, payload, session };
}
