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
 * Responds quickly at the route layer; redaction work below should stay fast
 * or be queued. Shopify expects acknowledgment (2xx) then completion within 30 days.
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
  console.log("[compliance] customers/data_request", {
    shop,
    shopId: payload.shop_id,
    shopDomain: payload.shop_domain ?? shop,
    dataRequestId: payload.data_request?.id,
    customerId: payload.customer?.id,
    customerEmail: payload.customer?.email,
    ordersRequested: payload.orders_requested ?? [],
  });

  // TODO (merchant process): If you later store customer PII (email, phone,
  // address, etc.), gather that data for customerId / orders_requested and
  // deliver it to the store owner (e.g. email / admin export). This app
  // currently stores shop-scoped analytics IDs only, not customer PII.
}

async function handleCustomersRedact(
  shop: string,
  payload: CustomerRedactPayload,
): Promise<void> {
  console.log("[compliance] customers/redact payload", {
    shop,
    shopId: payload.shop_id,
    shopDomain: payload.shop_domain ?? shop,
    customerId: payload.customer?.id,
    customerEmail: payload.customer?.email,
    ordersToRedact: payload.orders_to_redact ?? [],
  });

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

  // TODO: If you add tables that store customer email/phone/name keyed by
  // Shopify customer id, delete those rows here as well.
  console.log("[compliance] customers/redact completed", {
    shop,
    analyticsEventsDeleted: deleted,
  });
}

async function handleShopRedact(
  shop: string,
  payload: ShopRedactPayload,
): Promise<void> {
  const shopDomain = payload.shop_domain ?? shop;

  console.log("[compliance] shop/redact payload", {
    shop: shopDomain,
    shopId: payload.shop_id,
  });

  // Delete all persisted app data for this shop (sent ~48h after uninstall).
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

  // TODO: If you add more shop-scoped tables (billing, logs, etc.), delete
  // them in the transaction above.
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
