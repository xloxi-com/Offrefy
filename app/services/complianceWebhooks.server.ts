import { prisma as db } from "../db.server";

type CustomerPayload = {
  id?: number | string;
  email?: string | null;
  phone?: string | null;
};

type DataRequestPayload = {
  shop_id?: number | string;
  shop_domain?: string;
  orders_requested?: Array<number | string>;
  customer?: CustomerPayload;
  data_request?: { id?: number | string };
};

type CustomerRedactPayload = {
  shop_id?: number | string;
  shop_domain?: string;
  customer?: CustomerPayload;
  orders_to_redact?: Array<number | string>;
};

type ShopRedactPayload = {
  shop_id?: number | string;
  shop_domain?: string;
};

function normalizeTopic(topic: string): string {
  return topic.toLowerCase().replace(/_/g, "/");
}

/**
 * Handles mandatory compliance webhook topics.
 * Acknowledges receipt; completes redaction work where this app stores data.
 */
export async function handleComplianceWebhook(
  shop: string,
  topic: string,
  payload: unknown,
): Promise<void> {
  const topicKey = normalizeTopic(topic);

  switch (topicKey) {
    case "customers/data_request":
      await handleCustomersDataRequest(shop, payload as DataRequestPayload);
      break;
    case "customers/redact":
      await handleCustomersRedact(shop, payload as CustomerRedactPayload);
      break;
    case "shop/redact":
      await handleShopRedact(shop, payload as ShopRedactPayload);
      break;
    default:
      console.warn("[compliance] Unhandled compliance topic", { shop, topic });
  }
}

async function handleCustomersDataRequest(
  shop: string,
  payload: DataRequestPayload,
): Promise<void> {
  // This app does not store customer PII (email/phone/name). Analytics keep
  // shop-scoped order and product IDs only. Log the request for the merchant.
  console.log("[compliance] customers/data_request", {
    shop,
    shopId: payload.shop_id,
    shopDomain: payload.shop_domain ?? shop,
    dataRequestId: payload.data_request?.id,
    customerId: payload.customer?.id,
    ordersRequested: payload.orders_requested?.length ?? 0,
  });
}

async function handleCustomersRedact(
  shop: string,
  payload: CustomerRedactPayload,
): Promise<void> {
  const orderIds = (payload.orders_to_redact ?? []).map(String).filter(Boolean);

  let deleted = 0;
  if (orderIds.length > 0) {
    const result = await db.volumeDiscountAnalyticsEvent.deleteMany({
      where: {
        shop,
        orderId: { in: orderIds },
      },
    });
    deleted = result.count;
  }

  console.log("[compliance] customers/redact", {
    shop,
    shopId: payload.shop_id,
    shopDomain: payload.shop_domain ?? shop,
    customerId: payload.customer?.id,
    ordersToRedact: orderIds.length,
    analyticsEventsDeleted: deleted,
  });
}

async function handleShopRedact(
  shop: string,
  payload: ShopRedactPayload,
): Promise<void> {
  const shopDomain = payload.shop_domain ?? shop;

  // Delete all persisted data for this shop after uninstall + 48h.
  const [
    sessions,
    shopState,
    storefrontPayload,
    campaigns,
    rules,
    analytics,
    settings,
  ] = await db.$transaction([
    db.session.deleteMany({ where: { shop: shopDomain } }),
    db.volumeDiscountShopState.deleteMany({ where: { shop: shopDomain } }),
    db.volumeDiscountStorefrontPayload.deleteMany({
      where: { shop: shopDomain },
    }),
    db.volumeDiscountCampaign.deleteMany({ where: { shop: shopDomain } }),
    db.discountRule.deleteMany({ where: { shop: shopDomain } }),
    db.volumeDiscountAnalyticsEvent.deleteMany({ where: { shop: shopDomain } }),
    db.volumeDiscountSettings.deleteMany({ where: { shop: shopDomain } }),
  ]);

  console.log("[compliance] shop/redact completed", {
    shop: shopDomain,
    shopId: payload.shop_id,
    deleted: {
      sessions: sessions.count,
      shopState: shopState.count,
      storefrontPayload: storefrontPayload.count,
      campaigns: campaigns.count,
      rules: rules.count,
      analytics: analytics.count,
      settings: settings.count,
    },
  });
}
