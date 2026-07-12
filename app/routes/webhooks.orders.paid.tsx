import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { reconcileOrderAnalyticsForShop } from "../services/orderAnalyticsReconcile.server";
import {
  recordOrderAnalyticsFromWebhook,
  type ShopifyOrderWebhookPayload,
} from "../utils/volumeDiscountAnalytics.server";

async function handleOrderWebhook(
  shop: string,
  topic: string,
  payload: ShopifyOrderWebhookPayload,
) {
  const financialStatus = String(payload.financial_status ?? "").toLowerCase();
  const topicKey = topic.toUpperCase().replace(/\//g, "_");
  if (
    topicKey === "ORDERS_CREATE" ||
    topicKey === "ORDERS_UPDATED"
  ) {
    if (financialStatus !== "paid") return 0;
  }

  const recorded = await recordOrderAnalyticsFromWebhook(shop, payload);
  if (recorded > 0) {
    console.log("[volume-discount] order analytics", { shop, topic, recorded });
  } else {
    console.log("[volume-discount] order analytics skipped", {
      shop,
      topic,
      orderId: payload.id,
      lineItems: Array.isArray(payload.line_items)
        ? payload.line_items.length
        : 0,
    });
    // Webhook payload may omit line-item properties; reconcile this order via Admin API.
    await reconcileOrderAnalyticsForShop(shop, { force: true });
  }
  return recorded;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    await handleOrderWebhook(
      shop,
      topic,
      payload as ShopifyOrderWebhookPayload,
    );
  } catch (e) {
    console.error("[volume-discount] orders/paid analytics", shop, e);
  }

  return new Response();
};
