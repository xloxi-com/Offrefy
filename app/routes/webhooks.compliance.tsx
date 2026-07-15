import type { ActionFunctionArgs } from "react-router";
import { handleComplianceWebhook } from "../services/complianceWebhooks.server";
import { authenticateShopifyWebhook } from "../utils/webhookAuth.server";

/**
 * Mandatory compliance webhooks (registered via shopify.app.toml compliance_topics):
 * - customers/data_request
 * - customers/redact
 * - shop/redact
 *
 * Invalid HMAC → 401 (via authenticateShopifyWebhook).
 * Valid requests → 200 quickly (Shopify requires fast ack).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateShopifyWebhook(request);

  try {
    await handleComplianceWebhook(shop, topic, payload);
  } catch (error) {
    // Still acknowledge receipt so Shopify does not retry forever.
    // Complete any remaining redaction within 30 days if needed.
    console.error("[compliance] handler error", { shop, topic, error });
  }

  return new Response(null, { status: 200 });
};
