import { Prisma } from "@prisma/client";
import { prisma } from "../db.server";
import { ensureOffrefyAnalyticsPixel } from "../services/ensureOffrefyAnalyticsPixel.server";
import {
  lookupDiscountRulesForProducts,
  normalizeProductIdKey,
} from "./discountRules.server";
import type {
  AnalyticsRangeSelection,
  AnalyticsTimeRange,
} from "./volumeDiscountAnalytics.shared";

export type { AnalyticsTimeRange, AnalyticsRangeSelection } from "./volumeDiscountAnalytics.shared";

export type StorefrontAnalyticsEventInput = {
  type: "impression" | "add_to_cart";
  campaignId?: string;
  productId?: string;
  variantId?: string;
  quantity?: number;
  revenueCents?: number;
};

type PeriodTotals = {
  impressions: number;
  addToCart: number;
  revenueCents: number;
  orderCount: number;
  totalQuantity: number;
};

type ChartPoint = {
  label: string;
  revenue: number;
  views: number;
  addToCart: number;
};

export type TopProductRow = {
  productId: string;
  productTitle: string;
  impressions: number;
  addToCart: number;
  revenueCents: number;
  conversionRate: string;
};

export type DayOfWeekRow = {
  label: string;
  impressions: number;
  addToCart: number;
};

export type CampaignAnalyticsRow = {
  id: string;
  campaignName: string;
  status: string;
  views: number;
  addToCart: number;
  conversionRate: string;
  revenueCents: number;
};

export type AnalyticsDashboardData = {
  metrics: {
    revenueCents: number;
    revenueChange: string | null;
    impressions: number;
    impressionsChange: string | null;
    addToCart: number;
    addToCartChange: string | null;
    avgCartValueCents: number;
    avgCartValueChange: string | null;
    avgQuantity: string;
    revenuePerImpressionCents: number;
    activeCampaigns: string;
    conversionRate: string;
    conversionChange: string | null;
    chartData: ChartPoint[];
  };
  funnel: {
    impressions: number;
    addToCart: number;
    conversionRate: string;
  };
  campaignRows: CampaignAnalyticsRow[];
  topProducts: TopProductRow[];
  dayOfWeek: DayOfWeekRow[];
  bestCampaign: { id: string; name: string; revenueCents: number } | null;
  hasTrackingData: boolean;
  ordersSync: {
    needsReadOrdersScope: boolean;
    syncError: string | null;
  };
};

export type OrderReconcileResult = {
  recorded: number;
  syncError: string | null;
};

function sessionHasReadOrdersScope(grantedScopes: string[] | undefined): boolean {
  return (grantedScopes ?? []).includes("read_orders");
}

function graphqlErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "Unknown error");
  const gqlErrors = (
    error as { graphQLErrors?: Array<{ message?: string }> }
  ).graphQLErrors;
  if (gqlErrors?.length) {
    return gqlErrors
      .map((entry) => entry.message?.trim())
      .filter(Boolean)
      .join("; ");
  }
  if ("message" in error && typeof (error as Error).message === "string") {
    return (error as Error).message;
  }
  return String(error);
}

function isOrdersAccessError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("access denied") ||
    normalized.includes("not approved to access the order") ||
    normalized.includes("not authorized") ||
    normalized.includes("protected customer data") ||
    normalized.includes("read_orders") ||
    normalized.includes("required access")
  );
}

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const ALLOWED_EVENT_TYPES = new Set(["impression", "add_to_cart"]);

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatAvgQuantity(totalQty: number, orderCount: number): string {
  if (orderCount <= 0) return "0";
  return (Math.round((totalQty / orderCount) * 10) / 10).toFixed(1);
}

function avgCartValueCents(revenueCents: number, orderCount: number): number {
  if (orderCount <= 0) return 0;
  return Math.round(revenueCents / orderCount);
}

function revenuePerImpressionCents(
  revenueCents: number,
  impressions: number,
): number {
  if (impressions <= 0) return 0;
  return Math.round(revenueCents / impressions);
}

function formatPercentChange(current: number, previous: number): string | null {
  if (previous <= 0) {
    if (current <= 0) return null;
    return "+100%";
  }
  const delta = ((current - previous) / previous) * 100;
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatConversionRate(addToCart: number, impressions: number): string {
  if (impressions <= 0) return "0%";
  const rate = (addToCart / impressions) * 100;
  return `${(Math.round(rate * 10) / 10).toFixed(1)}%`;
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function utcDaysBetween(start: Date, end: Date): number {
  const ms = startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function rangeBounds(selection: AnalyticsRangeSelection): {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  comparePrevious: boolean;
  chartPreset: AnalyticsTimeRange;
  spanDays: number;
} {
  const end = new Date();

  if (selection.range === "custom" && selection.from && selection.to) {
    const fromDate = parseIsoDateUtc(selection.from);
    const toDate = parseIsoDateUtc(selection.to);
    const today = startOfUtcDay(end);
    const cappedTo = toDate > today ? today : toDate;
    const start = startOfUtcDay(fromDate);
    const rangeEnd = endOfUtcDay(cappedTo);
    const spanDays = utcDaysBetween(start, cappedTo) + 1;
    const prevEnd = endOfUtcDay(addUtcDays(start, -1));
    const prevStart = startOfUtcDay(addUtcDays(prevEnd, -(spanDays - 1)));

    return {
      start,
      end: rangeEnd > end ? end : rangeEnd,
      prevStart,
      prevEnd,
      comparePrevious: spanDays <= 90,
      chartPreset: "custom",
      spanDays,
    };
  }

  if (selection.range === "all") {
    return {
      start: new Date(0),
      end,
      prevStart: new Date(0),
      prevEnd: new Date(0),
      comparePrevious: false,
      chartPreset: "all",
      spanDays: 0,
    };
  }

  const days = selection.range === "30d" ? 30 : 7;
  const start = addUtcDays(startOfUtcDay(end), -(days - 1));
  const prevEnd = addUtcDays(start, -1);
  const prevStart = addUtcDays(prevEnd, -(days - 1));

  return {
    start,
    end,
    prevStart,
    prevEnd,
    comparePrevious: true,
    chartPreset: selection.range,
    spanDays: days,
  };
}

function parseIsoDateUtc(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function chartBucketKind(
  chartPreset: AnalyticsTimeRange,
  spanDays: number,
): "day" | "month" {
  if (chartPreset === "all") return "month";
  if (chartPreset === "custom") return spanDays > 62 ? "month" : "day";
  return "day";
}

async function totalsForPeriod(
  shop: string,
  start: Date,
  end: Date,
): Promise<PeriodTotals> {
  const rows = await prisma.$queryRaw<
    Array<{
      impressions: bigint;
      addToCart: bigint;
      revenueCents: bigint | null;
      orderCount: bigint | null;
      totalQuantity: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE "eventType" = 'impression')::bigint AS "impressions",
      COUNT(*) FILTER (WHERE "eventType" = 'add_to_cart')::bigint AS "addToCart",
      COALESCE(SUM("revenueCents") FILTER (WHERE "eventType" = 'order'), 0)::bigint AS "revenueCents",
      COUNT(DISTINCT "orderId") FILTER (WHERE "eventType" = 'order' AND "orderId" IS NOT NULL)::bigint AS "orderCount",
      COALESCE(SUM("quantity") FILTER (WHERE "eventType" = 'order'), 0)::bigint AS "totalQuantity"
    FROM "VolumeDiscountAnalyticsEvent"
    WHERE "shop" = ${shop}
      AND "createdAt" >= ${start}
      AND "createdAt" <= ${end}
  `);

  const row = rows[0];
  return {
    impressions: Number(row?.impressions ?? 0),
    addToCart: Number(row?.addToCart ?? 0),
    revenueCents: Number(row?.revenueCents ?? 0),
    orderCount: Number(row?.orderCount ?? 0),
    totalQuantity: Number(row?.totalQuantity ?? 0),
  };
}

async function chartDataForRange(
  shop: string,
  chartPreset: AnalyticsTimeRange,
  spanDays: number,
  start: Date,
  end: Date,
): Promise<ChartPoint[]> {
  const bucketKind = chartBucketKind(chartPreset, spanDays);
  const bucket =
    bucketKind === "month"
      ? Prisma.sql`date_trunc('month', "createdAt")`
      : Prisma.sql`date_trunc('day', "createdAt")`;

  const rows = await prisma.$queryRaw<
    Array<{
      bucket: Date;
      impressions: bigint;
      addToCart: bigint;
      revenueCents: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      ${bucket} AS "bucket",
      COUNT(*) FILTER (WHERE "eventType" = 'impression')::bigint AS "impressions",
      COUNT(*) FILTER (WHERE "eventType" = 'add_to_cart')::bigint AS "addToCart",
      COALESCE(SUM("revenueCents") FILTER (WHERE "eventType" = 'order'), 0)::bigint AS "revenueCents"
    FROM "VolumeDiscountAnalyticsEvent"
    WHERE "shop" = ${shop}
      AND "createdAt" >= ${start}
      AND "createdAt" <= ${end}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  if (bucketKind === "day") {
    return fillDailyChartSeries(
      rows,
      start,
      end,
      chartPreset === "7d",
    );
  }

  if (!rows.length) {
    return [{ label: "No data", revenue: 0, views: 0, addToCart: 0 }];
  }

  return rows.map((row) => {
    const date = new Date(row.bucket);
    const label = date.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

    return {
      label,
      revenue: Number(row.revenueCents ?? 0) / 100,
      views: Number(row.impressions ?? 0),
      addToCart: Number(row.addToCart ?? 0),
    };
  });
}

function fillDailyChartSeries(
  rows: Array<{
    bucket: Date;
    impressions: bigint;
    addToCart: bigint;
    revenueCents: bigint | null;
  }>,
  start: Date,
  end: Date,
  useWeekdayLabels: boolean,
): ChartPoint[] {
  const byDay = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    byDay.set(startOfUtcDay(new Date(row.bucket)).getTime(), row);
  }

  const points: ChartPoint[] = [];
  let cursor = startOfUtcDay(start);
  const last = startOfUtcDay(end);

  while (cursor.getTime() <= last.getTime()) {
    const row = byDay.get(cursor.getTime());
    const label = useWeekdayLabels
      ? cursor.toLocaleDateString(undefined, {
          weekday: "short",
          timeZone: "UTC",
        })
      : cursor.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });

    points.push({
      label,
      revenue: row ? Number(row.revenueCents ?? 0) / 100 : 0,
      views: row ? Number(row.impressions ?? 0) : 0,
      addToCart: row ? Number(row.addToCart ?? 0) : 0,
    });
    cursor = addUtcDays(cursor, 1);
  }

  return points.length
    ? points
    : [{ label: "No data", revenue: 0, views: 0, addToCart: 0 }];
}

async function topProductsForRange(
  shop: string,
  start: Date,
  end: Date,
): Promise<
  Array<{
    productId: string;
    impressions: number;
    addToCart: number;
    revenueCents: number;
  }>
> {
  const rows = await prisma.$queryRaw<
    Array<{
      productId: string | null;
      impressions: bigint;
      addToCart: bigint;
      revenueCents: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      "productId",
      COUNT(*) FILTER (WHERE "eventType" = 'impression')::bigint AS "impressions",
      COUNT(*) FILTER (WHERE "eventType" = 'add_to_cart')::bigint AS "addToCart",
      COALESCE(SUM("revenueCents") FILTER (WHERE "eventType" = 'order'), 0)::bigint AS "revenueCents"
    FROM "VolumeDiscountAnalyticsEvent"
    WHERE "shop" = ${shop}
      AND "createdAt" >= ${start}
      AND "createdAt" <= ${end}
      AND "productId" IS NOT NULL
    GROUP BY "productId"
    ORDER BY "revenueCents" DESC, "addToCart" DESC, "impressions" DESC
    LIMIT 8
  `);

  return rows
    .filter((row) => row.productId)
    .map((row) => ({
      productId: row.productId as string,
      impressions: Number(row.impressions ?? 0),
      addToCart: Number(row.addToCart ?? 0),
      revenueCents: Number(row.revenueCents ?? 0),
    }));
}

async function dayOfWeekForRange(
  shop: string,
  start: Date,
  end: Date,
): Promise<DayOfWeekRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      dow: number;
      impressions: bigint;
      addToCart: bigint;
    }>
  >(Prisma.sql`
    SELECT
      EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'UTC')::int AS "dow",
      COUNT(*) FILTER (WHERE "eventType" = 'impression')::bigint AS "impressions",
      COUNT(*) FILTER (WHERE "eventType" = 'add_to_cart')::bigint AS "addToCart"
    FROM "VolumeDiscountAnalyticsEvent"
    WHERE "shop" = ${shop}
      AND "createdAt" >= ${start}
      AND "createdAt" <= ${end}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDow = new Map(
    rows.map((row) => [
      Number(row.dow),
      {
        impressions: Number(row.impressions ?? 0),
        addToCart: Number(row.addToCart ?? 0),
      },
    ]),
  );

  return labels.map((label, dow) => {
    const stats = byDow.get(dow) ?? { impressions: 0, addToCart: 0 };
    return { label, ...stats };
  });
}

function productGid(productId: string): string {
  const trimmed = productId.trim();
  if (trimmed.startsWith("gid://")) return trimmed;
  if (/^\d+$/.test(trimmed)) {
    return `gid://shopify/Product/${trimmed}`;
  }
  return trimmed;
}

async function fetchProductTitles(
  admin: AdminGraphql | null | undefined,
  productIds: string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (!admin || !productIds.length) return titles;

  const gids = [...new Set(productIds.map(productGid))].slice(0, 8);
  try {
    const res = await admin.graphql(
      `#graphql
      query OffrefyAnalyticsProductTitles($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
          }
        }
      }`,
      { variables: { ids: gids } },
    );
    const body = (await res.json()) as {
      data?: {
        nodes?: Array<{ id?: string; title?: string } | null>;
      };
    };
    for (const node of body.data?.nodes ?? []) {
      if (node?.id && node.title) {
        titles.set(node.id, node.title);
        const numeric = node.id.split("/").pop();
        if (numeric) titles.set(numeric, node.title);
      }
    }
  } catch (e) {
    console.warn("[Offrefy] fetchProductTitles", e);
  }

  return titles;
}

async function campaignRowsForRange(
  shop: string,
  start: Date,
  end: Date,
): Promise<CampaignAnalyticsRow[]> {
  const campaigns = await prisma.volumeDiscountCampaign.findMany({
    where: { shop },
    select: {
      id: true,
      campaignName: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const stats = await prisma.$queryRaw<
    Array<{
      campaignId: string | null;
      impressions: bigint;
      addToCart: bigint;
      revenueCents: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      "campaignId",
      COUNT(*) FILTER (WHERE "eventType" = 'impression')::bigint AS "impressions",
      COUNT(*) FILTER (WHERE "eventType" = 'add_to_cart')::bigint AS "addToCart",
      COALESCE(SUM("revenueCents") FILTER (WHERE "eventType" = 'order'), 0)::bigint AS "revenueCents"
    FROM "VolumeDiscountAnalyticsEvent"
    WHERE "shop" = ${shop}
      AND "createdAt" >= ${start}
      AND "createdAt" <= ${end}
    GROUP BY "campaignId"
  `);

  const statsByCampaign = new Map(
    stats
      .filter((row) => row.campaignId)
      .map((row) => [
        row.campaignId as string,
        {
          views: Number(row.impressions ?? 0),
          addToCart: Number(row.addToCart ?? 0),
          revenueCents: Number(row.revenueCents ?? 0),
        },
      ]),
  );

  return campaigns
    .map((campaign) => {
      const row = statsByCampaign.get(campaign.id) ?? {
        views: 0,
        addToCart: 0,
        revenueCents: 0,
      };

      return {
        id: campaign.id,
        campaignName: campaign.campaignName,
        status: campaign.status,
        views: row.views,
        addToCart: row.addToCart,
        conversionRate: formatConversionRate(row.addToCart, row.views),
        revenueCents: row.revenueCents,
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

export async function recordStorefrontAnalyticsEvents(
  shop: string,
  events: StorefrontAnalyticsEventInput[],
): Promise<number> {
  const rows = events
    .filter((event) => ALLOWED_EVENT_TYPES.has(event.type))
    .map((event) => ({
      shop,
      campaignId: event.campaignId?.trim() || null,
      eventType: event.type,
      productId: event.productId?.trim() || null,
      variantId: event.variantId?.trim() || null,
      quantity:
        event.type === "add_to_cart" && Number.isFinite(event.quantity)
          ? Math.max(1, Math.floor(event.quantity as number))
          : null,
      revenueCents:
        event.type === "add_to_cart" && Number.isFinite(event.revenueCents)
          ? Math.max(0, Math.floor(event.revenueCents as number))
          : null,
    }));

  if (!rows.length) return 0;

  const result = await prisma.volumeDiscountAnalyticsEvent.createMany({
    data: rows,
  });

  return result.count;
}

const OFFREFY_LINE_PROP = "_offrefy";
const OFFREFY_CAMPAIGN_PROP = "_offrefy_campaign";
const OFFREFY_PRODUCT_PROP = "_offrefy_product";
const OFFREFY_PUBLIC_LINE_PROP = "offrefy";
const OFFREFY_PUBLIC_CAMPAIGN_PROP = "offrefy_campaign";
const OFFREFY_PUBLIC_PRODUCT_PROP = "offrefy_product";
const OFFREFY_CART_CAMPAIGN_ATTR = "offrefy_campaign";
const OFFREFY_CART_PRODUCT_ATTR = "offrefy_product";
const OFFREFY_CART_FLAG_ATTR = "offrefy";
const ATC_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type ShopifyOrderAttribute = {
  name?: string;
  value?: string | null;
};

type ShopifyDiscountAllocation = {
  title?: string | null;
  amount?: string | null;
  discount_application_index?: number;
};

type ShopifyOrderLineItem = {
  product_id?: number | string | null;
  variant_id?: number | string | null;
  quantity?: number;
  price?: string;
  discounted_total?: string | null;
  total_discount?: string | null;
  properties?: Array<{ name?: string; value?: string | null }> | null;
  discount_allocations?: ShopifyDiscountAllocation[] | null;
  hasOffrefyDiscount?: boolean;
};

type ShopifyDiscountApplication = {
  title?: string | null;
  type?: string | null;
};

export type ShopifyOrderWebhookPayload = {
  id?: number | string;
  created_at?: string;
  processed_at?: string;
  financial_status?: string;
  line_items?: ShopifyOrderLineItem[];
  note_attributes?: ShopifyOrderAttribute[] | null;
  discount_applications?: ShopifyDiscountApplication[] | null;
};

function lineItemProperty(
  line: ShopifyOrderLineItem,
  name: string,
): string | null {
  for (const prop of line.properties ?? []) {
    if (prop?.name === name && prop.value != null && String(prop.value).trim()) {
      return String(prop.value).trim();
    }
  }
  return null;
}

function lineItemPropertyAny(
  line: ShopifyOrderLineItem,
  names: string[],
): string | null {
  for (const name of names) {
    const value = lineItemProperty(line, name);
    if (value) return value;
  }
  return null;
}

function orderNoteAttribute(
  order: ShopifyOrderWebhookPayload,
  name: string,
): string | null {
  for (const attr of order.note_attributes ?? []) {
    if (attr?.name === name && attr.value != null && String(attr.value).trim()) {
      return String(attr.value).trim();
    }
  }
  return null;
}

function shopifyResourceIdVariants(
  value: string | number | null | undefined,
): string[] {
  if (value == null) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  const variants = new Set<string>([raw]);
  const tail = raw.split("/").pop();
  if (tail && /^\d+$/.test(tail)) variants.add(tail);
  return [...variants];
}

const OFFREFY_DISCOUNT_TITLE_MARKERS = ["offrefy", "quantity breaks"] as const;

function isOffrefyDiscountTitle(title: string | null | undefined): boolean {
  const normalized = String(title ?? "").toLowerCase();
  return OFFREFY_DISCOUNT_TITLE_MARKERS.some((marker) =>
    normalized.includes(marker),
  );
}

function orderHasOffrefyDiscount(order: ShopifyOrderWebhookPayload): boolean {
  for (const app of order.discount_applications ?? []) {
    if (isOffrefyDiscountTitle(app.title)) return true;
  }
  return false;
}

function lineHasOffrefyDiscountAllocation(line: ShopifyOrderLineItem): boolean {
  for (const allocation of line.discount_allocations ?? []) {
    const amount = Number.parseFloat(String(allocation.amount ?? "0"));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (isOffrefyDiscountTitle(allocation.title)) return true;
  }
  return false;
}

function lineHasOffrefyDiscountSignal(
  line: ShopifyOrderLineItem,
  orderUsedOffrefyDiscount: boolean,
): boolean {
  if (line.hasOffrefyDiscount) return true;
  if (lineHasOffrefyDiscountAllocation(line)) return true;
  if (lineHasQuantityDiscount(line) && orderUsedOffrefyDiscount) return true;
  const totalDiscount = Number.parseFloat(String(line.total_discount ?? "0"));
  return (
    orderUsedOffrefyDiscount &&
    Number.isFinite(totalDiscount) &&
    totalDiscount > 0
  );
}

async function campaignIdFromDiscountRule(
  shop: string,
  productId: string | number | null | undefined,
): Promise<string | null> {
  const key = normalizeProductIdKey(productId);
  if (!key) return null;

  const rules = await lookupDiscountRulesForProducts(shop, [key], {
    maxProducts: 1,
  });
  return rules[key]?.campaignId ?? rules["*"]?.campaignId ?? null;
}

async function campaignIdFromCampaignProducts(
  shop: string,
  productId: string | number | null | undefined,
): Promise<string | null> {
  const key = normalizeProductIdKey(productId);
  if (!key) return null;

  const campaigns = await prisma.volumeDiscountCampaign.findMany({
    where: { shop, status: "active" },
    select: { id: true, productScope: true, productIds: true },
    orderBy: { updatedAt: "desc" },
  });

  for (const campaign of campaigns) {
    if (String(campaign.productScope ?? "").toLowerCase() === "all") {
      return campaign.id;
    }
    const productIds = Array.isArray(campaign.productIds)
      ? (campaign.productIds as unknown[])
      : [];
    if (
      productIds.some(
        (raw) => normalizeProductIdKey(raw) === key,
      )
    ) {
      return campaign.id;
    }
  }

  return null;
}

const fallbackCampaignIdByShop = new Map<string, string | null>();

async function fallbackCampaignIdForShop(shop: string): Promise<string | null> {
  if (fallbackCampaignIdByShop.has(shop)) {
    return fallbackCampaignIdByShop.get(shop) ?? null;
  }

  const campaign = await prisma.volumeDiscountCampaign.findFirst({
    where: { shop, status: "active" },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  const campaignId = campaign?.id ?? null;
  fallbackCampaignIdByShop.set(shop, campaignId);
  return campaignId;
}

async function productHasActiveOffrefyOffer(
  shop: string,
  productId: string | number | null | undefined,
): Promise<boolean> {
  const key = normalizeProductIdKey(productId);
  if (!key) return false;

  const [rules, campaignId] = await Promise.all([
    lookupDiscountRulesForProducts(shop, [key], { maxProducts: 1 }),
    campaignIdFromCampaignProducts(shop, productId),
  ]);

  return Boolean(rules[key] || rules["*"] || campaignId);
}

async function lineQualifiesForWidgetSale(
  shop: string,
  line: ShopifyOrderLineItem,
  order: ShopifyOrderWebhookPayload,
  orderUsedOffrefyDiscount: boolean,
): Promise<boolean> {
  if (isOffrefyAttributedLine(line)) return true;
  if (campaignIdForLine(line, order)) return true;
  if (lineHasOffrefyDiscountSignal(line, orderUsedOffrefyDiscount)) return true;
  const orderTime = orderProcessedAt(order);
  const fromWidgetActivity = await campaignIdFromRecentWidgetActivity(
    shop,
    line,
    orderTime,
  );
  if (fromWidgetActivity) return true;
  if (!lineHasQuantityDiscount(line)) return false;
  return productHasActiveOffrefyOffer(shop, line.product_id);
}

async function resolveCampaignIdForQualifiedLine(
  shop: string,
  line: ShopifyOrderLineItem,
  order: ShopifyOrderWebhookPayload,
  orderTime: Date,
): Promise<string | null> {
  let campaignId = campaignIdForLine(line, order);
  if (!campaignId && isOffrefyAttributedLine(line)) {
    campaignId = lineItemPropertyAny(line, [
      OFFREFY_CAMPAIGN_PROP,
      OFFREFY_PUBLIC_CAMPAIGN_PROP,
    ]);
  }
  if (!campaignId) {
    campaignId = await campaignIdFromRecentWidgetActivity(shop, line, orderTime);
  }
  if (!campaignId) {
    campaignId = await campaignIdFromDiscountRule(shop, line.product_id);
  }
  if (!campaignId) {
    campaignId = await campaignIdFromCampaignProducts(shop, line.product_id);
  }
  if (!campaignId) {
    campaignId = await fallbackCampaignIdForShop(shop);
  }
  return campaignId;
}

function isOffrefyAttributedLine(line: ShopifyOrderLineItem): boolean {
  if (lineItemPropertyAny(line, [OFFREFY_LINE_PROP, OFFREFY_PUBLIC_LINE_PROP]) === "1") {
    return true;
  }
  return Boolean(
    lineItemPropertyAny(line, [
      OFFREFY_CAMPAIGN_PROP,
      OFFREFY_PUBLIC_CAMPAIGN_PROP,
    ]),
  );
}

function lineRevenueCents(line: ShopifyOrderLineItem): number {
  const qty = Math.max(0, Math.floor(line.quantity ?? 0));
  if (line.discounted_total != null) {
    const discounted = Number.parseFloat(String(line.discounted_total));
    if (Number.isFinite(discounted) && discounted > 0) {
      return Math.round(discounted * 100);
    }
  }
  const unit = Number.parseFloat(String(line.price ?? "0"));
  if (!Number.isFinite(unit) || qty <= 0) return 0;
  return Math.round(unit * qty * 100);
}

function lineHasQuantityDiscount(line: ShopifyOrderLineItem): boolean {
  if (line.hasOffrefyDiscount) return true;
  const qty = Math.max(0, Math.floor(line.quantity ?? 0));
  const unit = Number.parseFloat(String(line.price ?? "0"));
  const discounted =
    line.discounted_total != null
      ? Number.parseFloat(String(line.discounted_total))
      : Number.NaN;
  if (!Number.isFinite(unit) || qty <= 0 || !Number.isFinite(discounted)) {
    return false;
  }
  return discounted < unit * qty - 0.005;
}

function orderProcessedAt(order: ShopifyOrderWebhookPayload): Date {
  const raw = order.processed_at || order.created_at;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function campaignIdForLine(
  line: ShopifyOrderLineItem,
  order: ShopifyOrderWebhookPayload,
): string | null {
  const fromLine = lineItemPropertyAny(line, [
    OFFREFY_CAMPAIGN_PROP,
    OFFREFY_PUBLIC_CAMPAIGN_PROP,
  ]);
  if (fromLine) return fromLine;
  const fromCart = orderNoteAttribute(order, OFFREFY_CART_CAMPAIGN_ATTR);
  if (fromCart) return fromCart;
  return null;
}

async function campaignIdFromRecentAddToCart(
  shop: string,
  line: ShopifyOrderLineItem,
  orderTime: Date,
): Promise<string | null> {
  const variantIds = shopifyResourceIdVariants(line.variant_id);
  const productIds = shopifyResourceIdVariants(line.product_id);
  if (!variantIds.length && !productIds.length) return null;

  const windowStart = new Date(orderTime.getTime() - ATC_MATCH_WINDOW_MS);
  const idFilters: Array<{ variantId?: string; productId?: string }> = [];
  for (const variantId of variantIds) {
    idFilters.push({ variantId });
  }
  for (const productId of productIds) {
    idFilters.push({ productId });
  }

  const match = await prisma.volumeDiscountAnalyticsEvent.findFirst({
    where: {
      shop,
      eventType: "add_to_cart",
      campaignId: { not: null },
      createdAt: { gte: windowStart, lte: orderTime },
      OR: idFilters,
    },
    orderBy: { createdAt: "desc" },
    select: { campaignId: true },
  });

  return match?.campaignId ?? null;
}

async function campaignIdFromRecentWidgetActivity(
  shop: string,
  line: ShopifyOrderLineItem,
  orderTime: Date,
): Promise<string | null> {
  const fromAddToCart = await campaignIdFromRecentAddToCart(shop, line, orderTime);
  if (fromAddToCart) return fromAddToCart;

  const variantIds = shopifyResourceIdVariants(line.variant_id);
  const productIds = shopifyResourceIdVariants(line.product_id);
  if (!variantIds.length && !productIds.length) return null;

  const windowStart = new Date(orderTime.getTime() - ATC_MATCH_WINDOW_MS);
  const idFilters: Array<{ variantId?: string; productId?: string }> = [];
  for (const variantId of variantIds) {
    idFilters.push({ variantId });
  }
  for (const productId of productIds) {
    idFilters.push({ productId });
  }

  const match = await prisma.volumeDiscountAnalyticsEvent.findFirst({
    where: {
      shop,
      eventType: { in: ["add_to_cart", "impression"] },
      campaignId: { not: null },
      createdAt: { gte: windowStart, lte: orderTime },
      OR: idFilters,
    },
    orderBy: { createdAt: "desc" },
    select: { campaignId: true },
  });

  return match?.campaignId ?? null;
}

function enrichOrderLineDiscountAllocations(
  order: ShopifyOrderWebhookPayload,
): void {
  const applications = order.discount_applications ?? [];
  if (!applications.length) return;

  for (const line of order.line_items ?? []) {
    if (!line.discount_allocations?.length) continue;
    line.discount_allocations = line.discount_allocations.map(
      (allocation, index) => {
        if (allocation.title) return allocation;
        const app =
          applications[
            typeof (allocation as { discount_application_index?: number })
              .discount_application_index === "number"
              ? (allocation as { discount_application_index: number })
                  .discount_application_index
              : index
          ];
        return {
          ...allocation,
          title: app?.title ?? allocation.title ?? null,
        };
      },
    );
  }
}

function enrichOrderLineOffrefyFlags(order: ShopifyOrderWebhookPayload): void {
  const orderUsedOffrefyDiscount = orderHasOffrefyDiscount(order);
  for (const line of order.line_items ?? []) {
    if (line.hasOffrefyDiscount) continue;
    line.hasOffrefyDiscount = lineHasOffrefyDiscountSignal(
      line,
      orderUsedOffrefyDiscount,
    );
  }
}

async function buildAttributedOrderGroups(
  shop: string,
  order: ShopifyOrderWebhookPayload,
): Promise<
  Map<
    string,
    {
      campaignId: string;
      productId: string | null;
      variantId: string | null;
      quantity: number;
      revenueCents: number;
    }
  >
> {
  enrichOrderLineDiscountAllocations(order);
  enrichOrderLineOffrefyFlags(order);
  const grouped = new Map<
    string,
    {
      campaignId: string;
      productId: string | null;
      variantId: string | null;
      quantity: number;
      revenueCents: number;
    }
  >();
  const orderTime = orderProcessedAt(order);
  const lines = order.line_items ?? [];
  const orderUsedOffrefyDiscount = orderHasOffrefyDiscount(order);

  for (const line of lines) {
    const qualifies = await lineQualifiesForWidgetSale(
      shop,
      line,
      order,
      orderUsedOffrefyDiscount,
    );
    if (!qualifies) continue;

    const campaignId = await resolveCampaignIdForQualifiedLine(
      shop,
      line,
      order,
      orderTime,
    );
    if (!campaignId) continue;

    const productFromProp = lineItemPropertyAny(line, [
      OFFREFY_PRODUCT_PROP,
      OFFREFY_PUBLIC_PRODUCT_PROP,
    ]);
    const productFromCart = orderNoteAttribute(order, OFFREFY_CART_PRODUCT_ATTR);
    const productId =
      productFromProp ||
      productFromCart ||
      (line.product_id != null ? String(line.product_id) : null);
    const variantId =
      line.variant_id != null ? String(line.variant_id) : null;
    const quantity = Math.max(0, Math.floor(line.quantity ?? 0));
    const revenueCents = lineRevenueCents(line);
    if (quantity <= 0 && revenueCents <= 0) continue;

    const existing = grouped.get(campaignId) ?? {
      campaignId,
      productId,
      variantId,
      quantity: 0,
      revenueCents: 0,
    };
    existing.quantity += quantity;
    existing.revenueCents += revenueCents;
    if (!existing.productId && productId) existing.productId = productId;
    if (!existing.variantId && variantId) existing.variantId = variantId;
    grouped.set(campaignId, existing);
  }

  return grouped;
}

type PixelCheckoutAttribute = {
  key?: string | null;
  value?: string | null;
};

type PixelCheckoutDiscountApplication = {
  title?: string | null;
  type?: string | null;
};

type PixelCheckoutLineItem = {
  quantity?: number;
  properties?: PixelCheckoutAttribute[];
  variant?: { id?: string | null; product?: { id?: string | null } };
  finalLinePrice?: { amount?: number | null };
  discountAllocations?: Array<{
    amount?: { amount?: number | null };
    discountApplication?: { title?: string | null };
  }>;
};

export type PixelCheckoutCompletedPayload = {
  checkout?: {
    order?: { id?: string | null };
    attributes?: PixelCheckoutAttribute[];
    discountApplications?: PixelCheckoutDiscountApplication[];
    lineItems?: PixelCheckoutLineItem[];
  };
};

function legacyIdFromGid(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const tail = raw.split("/").pop();
  if (tail && /^\d+$/.test(tail)) return tail;
  return raw;
}

function pixelPropertiesToLineItemProperties(
  properties: PixelCheckoutAttribute[] | undefined,
): Array<{ name?: string; value?: string | null }> {
  return (properties ?? [])
    .filter((prop) => prop?.key)
    .map((prop) => ({
      name: String(prop.key),
      value: prop.value ?? null,
    }));
}

export async function recordCheckoutCompletedFromPixel(
  shop: string,
  payload: PixelCheckoutCompletedPayload,
): Promise<number> {
  const checkout = payload.checkout;
  if (!checkout) return 0;

  const orderId = legacyIdFromGid(checkout.order?.id);
  if (!orderId) return 0;

  const note_attributes = pixelPropertiesToLineItemProperties(checkout.attributes);
  const discount_applications = (checkout.discountApplications ?? []).map((app) => ({
    title: app.title ?? null,
    type: app.type ?? null,
  }));

  const line_items: ShopifyOrderLineItem[] = (checkout.lineItems ?? []).map(
    (line) => {
      const quantity = Math.max(0, Math.floor(line.quantity ?? 0));
      const discountedTotal =
        line.finalLinePrice?.amount != null
          ? String(line.finalLinePrice.amount)
          : null;
      const unit =
        discountedTotal != null && quantity > 0
          ? String(Number(discountedTotal) / quantity)
          : "0";
      const discount_allocations = (line.discountAllocations ?? []).map(
        (allocation) => ({
          title: allocation.discountApplication?.title ?? null,
          amount:
            allocation.amount?.amount != null
              ? String(allocation.amount.amount)
              : null,
        }),
      );

      return {
        product_id: legacyIdFromGid(line.variant?.product?.id),
        variant_id: legacyIdFromGid(line.variant?.id),
        quantity,
        price: unit,
        discounted_total: discountedTotal,
        properties: pixelPropertiesToLineItemProperties(line.properties),
        discount_allocations: discount_allocations.length
          ? discount_allocations
          : undefined,
      };
    },
  );

  const order: ShopifyOrderWebhookPayload = {
    id: orderId,
    processed_at: new Date().toISOString(),
    financial_status: "paid",
    note_attributes,
    discount_applications: discount_applications.length
      ? discount_applications
      : undefined,
    line_items,
  };

  return recordOrderAnalyticsFromWebhook(shop, order);
}

export async function recordOrderAnalyticsFromWebhook(
  shop: string,
  order: ShopifyOrderWebhookPayload,
): Promise<number> {
  const orderId = order.id != null ? String(order.id) : "";
  if (!orderId) return 0;

  const grouped = await buildAttributedOrderGroups(shop, order);
  if (!grouped.size) return 0;

  const existingRows = await prisma.volumeDiscountAnalyticsEvent.findMany({
    where: {
      shop,
      orderId,
      eventType: "order",
      campaignId: { in: [...grouped.keys()] },
    },
    select: { campaignId: true },
  });
  const existingCampaigns = new Set(
    existingRows.map((row) => row.campaignId).filter(Boolean) as string[],
  );

  const rows = [...grouped.values()]
    .filter((row) => !existingCampaigns.has(row.campaignId))
    .map((row) => ({
      shop,
      orderId,
      campaignId: row.campaignId,
      eventType: "order",
      productId: row.productId,
      variantId: row.variantId,
      quantity: row.quantity > 0 ? row.quantity : null,
      revenueCents: row.revenueCents > 0 ? row.revenueCents : null,
      createdAt: orderProcessedAt(order),
    }));

  if (!rows.length) return 0;

  const result = await prisma.volumeDiscountAnalyticsEvent.createMany({
    data: rows,
  });

  return result.count;
}

const OFFREFY_RECENT_ORDERS_QUERY_BASIC = `#graphql
  query OffrefyRecentOrdersBasic($query: String!) {
    orders(first: 50, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes {
        legacyResourceId
        processedAt
        createdAt
        displayFinancialStatus
        customAttributes {
          key
          value
        }
        discountApplications(first: 10) {
          nodes {
            ... on AutomaticDiscountApplication {
              title
            }
            ... on ManualDiscountApplication {
              title
            }
            ... on ScriptDiscountApplication {
              title
            }
          }
        }
        lineItems(first: 50) {
          nodes {
            quantity
            customAttributes {
              key
              value
            }
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
            discountedTotalSet(withCodeDiscounts: true) {
              shopMoney {
                amount
              }
            }
            totalDiscountSet {
              shopMoney {
                amount
              }
            }
            variant {
              legacyResourceId
            }
            product {
              legacyResourceId
            }
          }
        }
      }
    }
  }`;

const OFFREFY_RECENT_ORDERS_QUERY = `#graphql
  query OffrefyRecentOrders($query: String!) {
    orders(first: 50, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes {
        legacyResourceId
        processedAt
        createdAt
        displayFinancialStatus
        discountApplications(first: 10) {
          nodes {
            ... on AutomaticDiscountApplication {
              title
            }
            ... on ManualDiscountApplication {
              title
            }
            ... on ScriptDiscountApplication {
              title
            }
          }
        }
        lineItems(first: 50) {
          nodes {
            quantity
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
            discountedTotalSet(withCodeDiscounts: true) {
              shopMoney {
                amount
              }
            }
            totalDiscountSet {
              shopMoney {
                amount
              }
            }
            discountAllocations {
              allocatedAmountSet {
                shopMoney {
                  amount
                }
              }
              discountApplication {
                ... on AutomaticDiscountApplication {
                  title
                }
                ... on ManualDiscountApplication {
                  title
                }
                ... on ScriptDiscountApplication {
                  title
                }
              }
            }
            variant {
              legacyResourceId
            }
            product {
              legacyResourceId
            }
          }
        }
      }
    }
  }`;

type RecentOrderDiscountApplication = {
  title?: string | null;
};

type RecentOrderCustomAttribute = {
  key?: string | null;
  value?: string | null;
};

type RecentOrderDiscountAllocation = {
  allocatedAmountSet?: { shopMoney?: { amount?: string } };
  discountApplication?: RecentOrderDiscountApplication;
};

type RecentOrderLineNode = {
  quantity?: number;
  customAttributes?: RecentOrderCustomAttribute[];
  originalUnitPriceSet?: { shopMoney?: { amount?: string } };
  discountedTotalSet?: { shopMoney?: { amount?: string } };
  totalDiscountSet?: { shopMoney?: { amount?: string } };
  discountAllocations?: RecentOrderDiscountAllocation[];
  variant?: { legacyResourceId?: string };
  product?: { legacyResourceId?: string };
};

type RecentOrderNode = {
  legacyResourceId?: string;
  processedAt?: string;
  createdAt?: string;
  displayFinancialStatus?: string;
  customAttributes?: RecentOrderCustomAttribute[];
  discountApplications?: {
    nodes?: RecentOrderDiscountApplication[];
  };
  lineItems?: {
    nodes?: RecentOrderLineNode[];
  };
};

function customAttributesToOrderFields(
  attrs: RecentOrderCustomAttribute[] | undefined,
): {
  properties: Array<{ name?: string; value?: string | null }>;
} {
  return {
    properties: (attrs ?? [])
      .filter((attr) => attr?.key)
      .map((attr) => ({
        name: String(attr.key),
        value: attr.value ?? null,
      })),
  };
}

function normalizeFinancialStatus(status: string | null | undefined): string {
  return String(status ?? "").toLowerCase().replace(/\s+/g, "_");
}

function orderPayloadFromGraphqlNode(
  node: RecentOrderNode,
): ShopifyOrderWebhookPayload {
  const financialStatus = normalizeFinancialStatus(node.displayFinancialStatus);
  const discountApplications = (node.discountApplications?.nodes ?? [])
    .map((app) => ({ title: app.title ?? null }))
    .filter((app) => app.title);

  return {
    id: node.legacyResourceId,
    processed_at: node.processedAt ?? node.createdAt,
    created_at: node.createdAt,
    financial_status: financialStatus || undefined,
    note_attributes: customAttributesToOrderFields(node.customAttributes).properties,
    discount_applications: discountApplications.length
      ? discountApplications
      : undefined,
    line_items: (node.lineItems?.nodes ?? []).map((line) => {
      const price = line.originalUnitPriceSet?.shopMoney?.amount ?? "0";
      const discountedTotal =
        line.discountedTotalSet?.shopMoney?.amount ?? null;
      const totalDiscount = line.totalDiscountSet?.shopMoney?.amount ?? null;
      const discountAllocations = (line.discountAllocations ?? []).map(
        (allocation) => ({
          title: allocation.discountApplication?.title ?? null,
          amount: allocation.allocatedAmountSet?.shopMoney?.amount ?? null,
        }),
      );
      const lineItem: ShopifyOrderLineItem = {
        product_id: line.product?.legacyResourceId ?? null,
        variant_id: line.variant?.legacyResourceId ?? null,
        quantity: line.quantity ?? 0,
        price,
        discounted_total: discountedTotal,
        total_discount: totalDiscount,
        properties: customAttributesToOrderFields(line.customAttributes).properties,
        discount_allocations: discountAllocations.length
          ? discountAllocations
          : undefined,
      };
      const orderUsedOffrefyDiscount = discountApplications.some((app) =>
        isOffrefyDiscountTitle(app.title),
      );
      lineItem.hasOffrefyDiscount =
        lineHasOffrefyDiscountAllocation(lineItem) ||
        (orderUsedOffrefyDiscount && lineHasQuantityDiscount(lineItem));
      return lineItem;
    }),
  };
}

type FetchRecentOrdersResult = {
  nodes: RecentOrderNode[];
  error: string | null;
};

async function fetchRecentOrdersByStatus(
  admin: AdminGraphql,
  statusQuery: string,
): Promise<FetchRecentOrdersResult> {
  const queries = [OFFREFY_RECENT_ORDERS_QUERY_BASIC, OFFREFY_RECENT_ORDERS_QUERY];
  let lastError: string | null = null;

  for (const query of queries) {
    try {
      const res = await admin.graphql(query, {
        variables: { query: statusQuery },
      });
      const body = (await res.json()) as {
        data?: { orders?: { nodes?: RecentOrderNode[] } };
        errors?: Array<{ message?: string }>;
      };
      if (body.errors?.length) {
        lastError = body.errors
          .map((error) => error.message?.trim())
          .filter(Boolean)
          .join("; ");
        console.warn(
          "[volume-discount] fetchRecentOrdersByStatus",
          statusQuery,
          lastError,
        );
        continue;
      }
      const nodes = body.data?.orders?.nodes ?? [];
      if (nodes.length || query === queries[queries.length - 1]) {
        return { nodes, error: null };
      }
    } catch (e) {
      lastError = graphqlErrorMessage(e);
      console.warn(
        "[volume-discount] fetchRecentOrdersByStatus",
        statusQuery,
        lastError,
      );
    }
  }

  return { nodes: [], error: lastError };
}

export async function reconcileRecentPaidOrders(
  shop: string,
  admin: AdminGraphql,
): Promise<OrderReconcileResult> {
  fallbackCampaignIdByShop.delete(shop);
  try {
    const [paidResult, pendingResult] = await Promise.all([
      fetchRecentOrdersByStatus(admin, "financial_status:paid"),
      fetchRecentOrdersByStatus(admin, "financial_status:pending"),
    ]);

    const syncError = paidResult.error ?? pendingResult.error;
    const seenOrderIds = new Set<string>();
    let recorded = 0;

    for (const node of [...paidResult.nodes, ...pendingResult.nodes]) {
      if (!node?.legacyResourceId) continue;
      const orderId = String(node.legacyResourceId);
      if (seenOrderIds.has(orderId)) continue;
      seenOrderIds.add(orderId);

      const payload = orderPayloadFromGraphqlNode(node);
      const status = normalizeFinancialStatus(payload.financial_status);
      if (status === "voided" || status === "refunded") continue;

      recorded += await recordOrderAnalyticsFromWebhook(shop, payload);
    }

    if (recorded > 0) {
      console.log("[volume-discount] reconciled recent orders", { shop, recorded });
    }
    return { recorded, syncError };
  } catch (e) {
    const syncError = graphqlErrorMessage(e);
    console.warn("[volume-discount] reconcileRecentPaidOrders", shop, syncError);
    return { recorded: 0, syncError };
  }
}

export async function loadAnalyticsDashboard(
  shop: string,
  selection: AnalyticsRangeSelection,
  admin?: AdminGraphql | null,
  options?: { grantedScopes?: string[] },
): Promise<AnalyticsDashboardData> {
  const needsReadOrdersScope = !sessionHasReadOrdersScope(options?.grantedScopes);
  let ordersSyncError: string | null = needsReadOrdersScope
    ? "Missing read_orders permission. Re-open the app from Shopify Admin to approve order access."
    : null;

  if (admin) {
    await ensureOffrefyAnalyticsPixel(admin).catch((error) => {
      console.warn("[Offrefy] loadAnalyticsDashboard pixel setup", error);
    });

    if (!needsReadOrdersScope) {
      const reconcileResult = await reconcileRecentPaidOrders(shop, admin);
      if (
        reconcileResult.syncError &&
        !isOrdersAccessError(reconcileResult.syncError)
      ) {
        ordersSyncError = reconcileResult.syncError;
      }
    }
  }

  const { start, end, prevStart, prevEnd, comparePrevious, chartPreset, spanDays } =
    rangeBounds(selection);

  const emptyTotals = {
    impressions: 0,
    addToCart: 0,
    revenueCents: 0,
    orderCount: 0,
    totalQuantity: 0,
  };

  const [
    campaigns,
    current,
    previous,
    chartData,
    campaignRows,
    trackingCount,
    topProductStats,
    dayOfWeek,
  ] = await Promise.all([
    prisma.volumeDiscountCampaign.findMany({
      where: { shop },
      select: { status: true },
    }),
    totalsForPeriod(shop, start, end),
    comparePrevious
      ? totalsForPeriod(shop, prevStart, prevEnd)
      : Promise.resolve(emptyTotals),
    chartDataForRange(shop, chartPreset, spanDays, start, end),
    campaignRowsForRange(shop, start, end),
    prisma.volumeDiscountAnalyticsEvent.count({ where: { shop } }),
    topProductsForRange(shop, start, end),
    dayOfWeekForRange(shop, start, end),
  ]);

  const productTitles = await fetchProductTitles(
    admin,
    topProductStats.map((row) => row.productId),
  );

  const topProducts: TopProductRow[] = topProductStats.map((row) => ({
    productId: row.productId,
    productTitle:
      productTitles.get(row.productId) ??
      productTitles.get(productGid(row.productId)) ??
      `Product ${row.productId.replace(/\D/g, "").slice(-6) || row.productId}`,
    impressions: row.impressions,
    addToCart: row.addToCart,
    revenueCents: row.revenueCents,
    conversionRate: formatConversionRate(row.addToCart, row.impressions),
  }));

  const bestCampaignRow = campaignRows.find((row) => row.revenueCents > 0);
  const bestCampaign = bestCampaignRow
    ? {
        id: bestCampaignRow.id,
        name: bestCampaignRow.campaignName,
        revenueCents: bestCampaignRow.revenueCents,
      }
    : null;

  const activeCount = campaigns.filter(
    (campaign) => campaign.status.toLowerCase() === "active",
  ).length;

  const currentAvgCart = avgCartValueCents(
    current.revenueCents,
    current.orderCount,
  );
  const previousAvgCart = avgCartValueCents(
    previous.revenueCents,
    previous.orderCount,
  );

  return {
    hasTrackingData: trackingCount > 0,
    ordersSync: {
      needsReadOrdersScope,
      syncError: ordersSyncError,
    },
    funnel: {
      impressions: current.impressions,
      addToCart: current.addToCart,
      conversionRate: formatConversionRate(
        current.addToCart,
        current.impressions,
      ),
    },
    bestCampaign,
    topProducts,
    dayOfWeek,
    metrics: {
      revenueCents: current.revenueCents,
      revenueChange: comparePrevious
        ? formatPercentChange(current.revenueCents, previous.revenueCents)
        : null,
      impressions: current.impressions,
      impressionsChange: comparePrevious
        ? formatPercentChange(current.impressions, previous.impressions)
        : null,
      addToCart: current.addToCart,
      addToCartChange: comparePrevious
        ? formatPercentChange(current.addToCart, previous.addToCart)
        : null,
      avgCartValueCents: currentAvgCart,
      avgCartValueChange: comparePrevious
        ? formatPercentChange(currentAvgCart, previousAvgCart)
        : null,
      avgQuantity: formatAvgQuantity(current.totalQuantity, current.orderCount),
      revenuePerImpressionCents: revenuePerImpressionCents(
        current.revenueCents,
        current.impressions,
      ),
      activeCampaigns: `${activeCount} / ${campaigns.length}`,
      conversionRate: formatConversionRate(
        current.addToCart,
        current.impressions,
      ),
      conversionChange: comparePrevious
        ? formatPercentChange(
            current.impressions > 0
              ? current.addToCart / current.impressions
              : 0,
            previous.impressions > 0
              ? previous.addToCart / previous.impressions
              : 0,
          )
        : null,
      chartData,
    },
    campaignRows,
  };
}
