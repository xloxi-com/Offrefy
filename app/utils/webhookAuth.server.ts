import { authenticate } from "../shopify.server";

/**
 * Authenticates an incoming Shopify webhook.
 *
 * HMAC verification uses `SHOPIFY_API_SECRET` (env) via the Shopify library,
 * with a timing-safe comparison. Invalid signatures yield HTTP 401.
 */
export async function authenticateShopifyWebhook(request: Request) {
  try {
    return await authenticate.webhook(request);
  } catch (error) {
    if (error instanceof Response) {
      if (error.status === 401) {
        console.error("[webhooks] HMAC verification failed", {
          url: request.url,
          method: request.method,
          status: 401,
        });
      } else if (error.status >= 400) {
        console.error("[webhooks] Webhook validation failed", {
          url: request.url,
          method: request.method,
          status: error.status,
        });
      }
    } else {
      console.error("[webhooks] Unexpected webhook auth error", error);
    }
    throw error;
  }
}
