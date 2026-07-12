import type { Prisma, VolumeDiscountCampaign } from "@prisma/client";

import { prisma } from "../db.server";
import { normalizeCatalogIdKey } from "./discountRules.server";
import { discountRuleDb } from "./discountRuleDb.server";
import { getVolumeDiscountStorefrontPayload } from "../services/volumeDiscountStorefrontCache.server";
import { volumeDiscountCampaignSyncSelect } from "./volumeDiscountCampaignSelect.server";
import type { DiscountRuleRecord } from "../types/discountRule";
import { getMemoryCachedJson, setMemoryCachedJson, invalidateMemoryCachePrefix } from "./memoryCache.server";
import {
  loadStorefrontTranslationsForShop,
} from "./storefrontTranslations.server";
import type { StorefrontTranslationsMap } from "./storefrontTranslations";

/** DB row shape for widget JSON — only fields required to build storefront payload. */
export type VolumeDiscountCampaignStorefrontRow = Pick<
  VolumeDiscountCampaign,
  | "id"
  | "campaignName"
  | "displayName"
  | "productScope"
  | "quantityCondition"
  | "customerType"
  | "customerTags"
  | "productIds"
  | "collectionIds"
  | "tiers"
  | "widgetDisplay"
  | "status"
  | "countdownStartsAt"
  | "countdownEndsAt"
  | "createdAt"
  | "updatedAt"
  | "shop"
>;

import { buyLabelsForQuantityTiers } from "./buyLabelsForQuantityTiers";
import {
  buildCampaignConfigFromDbRow,
  buildVolumeDiscountFunctionConfig,
  type FunctionTierConfig,
} from "./volumeDiscountFunctionConfig.server";
import { normalizeTiersFromDb } from "./volumeDiscountTier";
import type { TierPayload } from "../types/volumeDiscount";
import {
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "./widgetDisplay";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type StorefrontWidgetTier = FunctionTierConfig & {
  buyLabel: string;
  /** Shown under the option label when set; independent of “You save”. */
  optionSubtext: string;
  badge: string | null;
  activeByDefault: boolean;
};

export type StorefrontWidgetCampaign = {
  id: string;
  campaignName: string;
  displayName: string | null;
  productScope: string;
  quantityCondition: string;
  customerType: string;
  customerTags: string[];
  productIds: string[];
  tiers: StorefrontWidgetTier[];
  widgetDisplay: VolumeDiscountWidgetDisplay;
  /** ISO 8601 UTC — optional; countdown hidden until this instant when set. */
  countdownStartsAt: string | null;
  /** ISO 8601 UTC — required on the storefront for a live timer (with `showCountdown`). */
  countdownEndsAt: string | null;
};

function badgeForMinQty(
  rawTiers: TierPayload[],
  minQty: number,
): string | null {
  for (const t of rawTiers) {
    const m = Math.max(1, parseInt(String(t.buyFrom), 10) || 1);
    if (m === minQty) {
      const b = t.badge?.trim();
      return b ? b : null;
    }
  }
  return null;
}

function activeDefaultForMinQty(
  rawTiers: TierPayload[],
  minQty: number,
): boolean {
  for (const t of rawTiers) {
    const m = Math.max(1, parseInt(String(t.buyFrom), 10) || 1);
    if (m === minQty) return t.activeByDefault;
  }
  return false;
}

function buyLabelTextForMinQty(
  rawTiers: TierPayload[],
  minQty: number,
): string | null {
  for (const t of rawTiers) {
    const m = Math.max(1, parseInt(String(t.buyFrom), 10) || 1);
    if (m === minQty) {
      const s = t.buyLabelText.trim();
      return s.length > 0 ? s : null;
    }
  }
  return null;
}

function optionSubtextForMinQty(
  rawTiers: TierPayload[],
  minQty: number,
): string {
  for (const t of rawTiers) {
    const m = Math.max(1, parseInt(String(t.buyFrom), 10) || 1);
    if (m === minQty) {
      return typeof t.optionSubtext === "string" ? t.optionSubtext.trim() : "";
    }
  }
  return "";
}

/**
 * Merge DB rows + function-config campaigns into storefront widget JSON (no GraphQL).
 * Use with the result of `buildVolumeDiscountFunctionConfig` to avoid running it twice on save.
 */
export async function buildStorefrontWidgetJsonString(
  rows: VolumeDiscountCampaignStorefrontRow[],
  builtCampaigns: unknown[],
): Promise<string> {
  const built = builtCampaigns as StorefrontWidgetCampaign[];
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const out: StorefrontWidgetCampaign[] = [];

  const shop = rows[0]?.shop;
  let translations = {};
  if (shop) {
    try {
      translations = await loadStorefrontTranslationsForShop(shop);
    } catch (e) {
      console.error("[volume-discount] Failed querying translations", e);
    }
  }

  for (const c of built) {
    const row = rowById.get(c.id);
    const rawTiers = row ? normalizeTiersFromDb(row.tiers) : [];
    const buyNums = c.tiers.map((t) => t.minQty);
    const labels = buyLabelsForQuantityTiers(buyNums);
    const tiers: StorefrontWidgetTier[] = c.tiers.map((ft, i) => {
      const badge = badgeForMinQty(rawTiers, ft.minQty);
      return {
        ...ft,
        buyLabel:
          buyLabelTextForMinQty(rawTiers, ft.minQty) ??
          labels[i] ??
          `Buy ${ft.minQty}+`,
        optionSubtext: optionSubtextForMinQty(rawTiers, ft.minQty),
        badge,
        activeByDefault: activeDefaultForMinQty(rawTiers, ft.minQty),
      };
    });
    const wd = normalizeVolumeDiscountWidgetDisplay(row?.widgetDisplay ?? {});
    out.push({
      ...c,
      tiers,
      widgetDisplay: wd,
      countdownStartsAt: row?.countdownStartsAt?.toISOString() ?? null,
      countdownEndsAt: row?.countdownEndsAt?.toISOString() ?? null,
    });
  }

  return JSON.stringify({
    version: 1,
    campaigns: out,
    translations,
  });
}

/** Max shop metafield JSON embedded in Liquid before switching to per-product API mode. */
export const STOREFRONT_WIDGET_INLINE_MAX_CHARS = 180_000;

export function compactStorefrontShopMetafieldPayload(fullWidgetJson: string): string {
  if (fullWidgetJson.length <= STOREFRONT_WIDGET_INLINE_MAX_CHARS) {
    return fullWidgetJson;
  }
  try {
    const parsed = JSON.parse(fullWidgetJson) as {
      translations?: StorefrontTranslationsMap;
    };
    return JSON.stringify({
      version: 1,
      mode: "per_product",
      campaigns: [],
      translations: parsed.translations ?? {},
    });
  } catch {
    return JSON.stringify({ version: 1, mode: "per_product", campaigns: [] });
  }
}

function storefrontProductMatch(
  campaign: StorefrontWidgetCampaign,
  productId: string,
  variantId: string | null,
): boolean {
  if (campaign.productScope === "all") return true;
  const p = productId.trim();
  const v = variantId?.trim() ?? "";
  const ids = campaign.productIds ?? [];
  for (const raw of ids) {
    const s = String(raw).trim();
    if (!s) continue;
    if (p && (s === p || s.includes(`/Product/${p}`))) return true;
    if (v && (s === v || s.includes(`/Variant/${v}`))) return true;
  }
  return false;
}

function pickStorefrontCampaignFromPayload(
  payload: string,
  productId: string,
  variantId: string | null,
): StorefrontWidgetCampaign | null {
  try {
    const cfg = JSON.parse(payload) as {
      campaigns?: StorefrontWidgetCampaign[];
    };
    const list = Array.isArray(cfg.campaigns) ? cfg.campaigns : [];
    for (const c of list) {
      if (!c?.tiers?.length) continue;
      if (storefrontProductMatch(c, productId, variantId)) return c;
    }
  } catch {
    void 0;
  }
  return null;
}

function buildSingleCampaignWidgetPayload(
  campaign: StorefrontWidgetCampaign,
  translations: StorefrontTranslationsMap,
): string {
  return JSON.stringify({
    version: 1,
    campaigns: [campaign],
    translations,
  });
}

async function resolveStorefrontTranslationsForWidget(
  shop: string,
): Promise<StorefrontTranslationsMap> {
  return loadStorefrontTranslationsForShop(shop);
}

/**
 * Build widget JSON for one product page (avoids downloading 1000+ campaigns to the browser).
 */
export async function buildStorefrontWidgetForProduct(
  shop: string,
  productIdRaw: string,
  variantIdRaw: string | null,
  admin: AdminGraphql | null,
): Promise<string> {
  const productKey = normalizeCatalogIdKey(productIdRaw);
  const variantKey = variantIdRaw
    ? normalizeCatalogIdKey(variantIdRaw)
    : "";

  if (!productKey && !variantKey) {
    return JSON.stringify({ version: 1, campaigns: [] });
  }

  // 1. Try to get cached payload from memory cache first!
  const fullMemKey = `widget:${shop}:full`;
  let fullPayload = getMemoryCachedJson(fullMemKey);
  let cachedDbReadDone = false;

  if (!fullPayload) {
    // 2. Memory cache miss, read from database
    const cachedRow = await getVolumeDiscountStorefrontPayload(shop);
    cachedDbReadDone = true;
    if (cachedRow?.payload) {
      fullPayload = cachedRow.payload;
      // Cache the full storefront payload in memory to make future product page loads instant
      setMemoryCachedJson(fullMemKey, fullPayload, 45_000);
    }
  }

  if (fullPayload) {
    const camp = pickStorefrontCampaignFromPayload(
      fullPayload,
      productKey,
      variantKey || null,
    );
    if (camp) {
      const translations = await resolveStorefrontTranslationsForWidget(shop);
      return buildSingleCampaignWidgetPayload(camp, translations);
    }
  }

  // 3. Fallback: query discount rules ONLY if we didn't find a cached payload/campaign
  const rules = await discountRuleDb().findMany({
    where: {
      shop,
      status: "active",
      productId: {
        in: [
          ...new Set([productKey, variantKey, "*"].filter(Boolean)),
        ],
      },
    },
    select: { productId: true, campaignId: true },
  });

  const ruleByProductId = new Map(
    rules.map((r: DiscountRuleRecord) => [r.productId, r.campaignId]),
  );

  let campaignId =
    (productKey && ruleByProductId.get(productKey)) ||
    (variantKey && ruleByProductId.get(variantKey)) ||
    ruleByProductId.get("*");

  if (!campaignId) {
    return JSON.stringify({ version: 1, campaigns: [] });
  }

  const row = await prisma.volumeDiscountCampaign.findFirst({
    where: { shop, id: campaignId, status: "active" },
    select: volumeDiscountCampaignSyncSelect,
  });
  if (!row) {
    return JSON.stringify({ version: 1, campaigns: [] });
  }

  const matchedKey = productKey || variantKey || undefined;
  const builtFromDb = buildCampaignConfigFromDbRow(
    {
      id: row.id,
      campaignName: row.campaignName,
      displayName: row.displayName,
      productScope: row.productScope,
      quantityCondition: row.quantityCondition,
      customerType: row.customerType,
      customerTags: row.customerTags,
      productIds: row.productIds,
      collectionIds: row.collectionIds,
      tiers: row.tiers,
    },
    matchedKey,
  );
  if (builtFromDb) {
    return await buildStorefrontWidgetJsonString([row], [builtFromDb]);
  }

  if (!admin) {
    // If we haven't read from database yet, read it now as fallback
    let fallbackPayload = fullPayload;
    if (!fallbackPayload && !cachedDbReadDone) {
      const cachedRow = await getVolumeDiscountStorefrontPayload(shop);
      if (cachedRow?.payload) {
        fallbackPayload = cachedRow.payload;
        setMemoryCachedJson(fullMemKey, fallbackPayload, 45_000);
      }
    }
    if (fallbackPayload) {
      const camp = pickStorefrontCampaignFromPayload(
        fallbackPayload,
        productKey,
        variantKey || null,
      );
      if (camp) {
        const translations = await resolveStorefrontTranslationsForWidget(shop);
        return buildSingleCampaignWidgetPayload(camp, translations);
      }
    }
    return JSON.stringify({ version: 1, campaigns: [] });
  }

  const { campaigns } = await buildVolumeDiscountFunctionConfig(
    [
      {
        id: row.id,
        campaignName: row.campaignName,
        displayName: row.displayName,
        productScope: row.productScope,
        quantityCondition: row.quantityCondition,
        customerType: row.customerType,
        customerTags: row.customerTags,
        productIds: row.productIds,
        collectionIds: row.collectionIds,
        tiers: row.tiers,
      },
    ],
    admin,
    shop,
  );

  return await buildStorefrontWidgetJsonString([row], campaigns);
}

export async function buildStorefrontWidgetValue(
  rows: VolumeDiscountCampaignStorefrontRow[],
  admin: AdminGraphql,
  shop?: string,
): Promise<string> {
  const { campaigns } = await buildVolumeDiscountFunctionConfig(
    rows.map((r) => ({
      id: r.id,
      campaignName: r.campaignName,
      displayName: r.displayName,
      productScope: r.productScope,
      quantityCondition: r.quantityCondition,
      customerType: r.customerType,
      customerTags: r.customerTags,
      productIds: r.productIds,
      collectionIds: r.collectionIds,
      tiers: r.tiers,
    })),
    admin,
    shop,
  );

  return await buildStorefrontWidgetJsonString(rows, campaigns);
}
