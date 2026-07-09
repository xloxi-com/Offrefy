import type { Prisma } from "@prisma/client";
import type { FunctionTierConfig } from "./volumeDiscountFunctionConfig.server";
import { discountRuleDb } from "./discountRuleDb.server";

export type DiscountRuleTier = {
  minQuantity: number;
  discountType: "percentage" | "fixed" | "fixed_price";
  value: number;
  appliesToEachItem?: boolean;
};

export type ProductRulePayload = {
  campaignId: string;
  status: "active" | "draft";
  label: string;
  quantityCondition: string;
  customerType: string;
  customerTags: string[];
  tiers: FunctionTierConfig[];
};

/** `gid://shopify/Product/123`, variant GID, or `123` → numeric tail when possible. */
export function normalizeCatalogIdKey(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const pm = s.match(/\/Product\/(\d+)/);
  if (pm) return pm[1]!;
  const vm = s.match(/\/ProductVariant\/(\d+)/);
  if (vm) return vm[1]!;
  if (/^\d+$/.test(s)) return s;
  return s;
}

/** @deprecated use normalizeCatalogIdKey */
export function normalizeProductIdKey(raw: unknown): string {
  return normalizeCatalogIdKey(raw);
}

function functionTiersToRuleTiers(tiers: FunctionTierConfig[]): DiscountRuleTier[] {
  const out: DiscountRuleTier[] = [];
  for (const t of tiers) {
    if (t.percent != null) {
      out.push({
        minQuantity: t.minQty,
        discountType: "percentage",
        value: t.percent,
      });
    } else if (t.fixedPricePerUnit != null) {
      out.push({
        minQuantity: t.minQty,
        discountType: "fixed_price",
        value: t.fixedPricePerUnit,
      });
    } else if (t.fixedAmount != null) {
      out.push({
        minQuantity: t.minQty,
        discountType: "fixed",
        value: t.fixedAmount,
        appliesToEachItem: t.appliesToEachItem,
      });
    }
  }
  return out;
}

function tierScoreAtQtyOne(tiers: FunctionTierConfig[]): number {
  const t = tiers.find((x) => x.minQty <= 1) ?? tiers[0];
  if (!t) return 0;
  if (t.percent != null) return t.percent;
  if (t.fixedAmount != null) return t.fixedAmount;
  if (t.fixedPricePerUnit != null) return t.fixedPricePerUnit;
  return 0;
}

type CampaignForRules = {
  id: string;
  campaignName: string;
  displayName?: string | null;
  productScope: string;
  quantityCondition: string;
  customerType: string;
  customerTags: string[];
  productIds: string[];
  tiers: FunctionTierConfig[];
};

/**
 * Expand campaigns into per-product rows and upsert `DiscountRule`.
 * Duplicate product ids across campaigns: keep the campaign with the better tier at qty 1.
 */
export async function rebuildDiscountRulesForShop(
  shop: string,
  campaigns: CampaignForRules[],
): Promise<{ ruleCount: number }> {
  /** productId → winning campaign payload */
  const winner = new Map<string, CampaignForRules>();

  for (const campaign of campaigns) {
    const scope = String(campaign.productScope ?? "all");
    const productKeys = new Set<string>();

    if (scope === "all") {
      productKeys.add("*");
    } else {
      for (const raw of campaign.productIds) {
        const k = normalizeProductIdKey(raw);
        if (k) productKeys.add(k);
      }
    }

    for (const productId of productKeys) {
      const prev = winner.get(productId);
      if (!prev) {
        winner.set(productId, campaign);
        continue;
      }
      const prevScore = tierScoreAtQtyOne(prev.tiers);
      const nextScore = tierScoreAtQtyOne(campaign.tiers);
      if (nextScore > prevScore) {
        winner.set(productId, campaign);
      }
    }
  }

  await discountRuleDb().deleteMany({ where: { shop } });

  const rows: import("../types/discountRule").DiscountRuleCreateInput[] = [];
  for (const [productId, campaign] of winner) {
    rows.push({
      shop,
      campaignId: campaign.id,
      productId,
      status: "active",
      tiers: functionTiersToRuleTiers(campaign.tiers) as Prisma.InputJsonValue,
      quantityCondition: campaign.quantityCondition,
      customerType: campaign.customerType,
      customerTags: campaign.customerTags as Prisma.InputJsonValue,
      displayName: campaign.displayName ?? null,
      campaignName: campaign.campaignName,
    });
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await discountRuleDb().createMany({ data: rows.slice(i, i + BATCH) });
  }

  return { ruleCount: rows.length };
}

/** Lookup active rules for cart product ids (used by app-proxy / network-access fetch). */
export async function lookupDiscountRulesForProducts(
  shop: string,
  productIds: string[],
): Promise<Record<string, ProductRulePayload>> {
  const keys = [
    ...new Set(
      productIds.map(normalizeProductIdKey).filter(Boolean),
    ),
  ];
  if (!keys.length) return {};

  const rows = await discountRuleDb().findMany({
    where: {
      shop,
      status: "active",
      productId: { in: [...keys, "*"] },
    },
    select: {
      productId: true,
      campaignId: true,
      tiers: true,
      quantityCondition: true,
      customerType: true,
      customerTags: true,
      displayName: true,
      campaignName: true,
    },
  });

  const byProductId = new Map<string, (typeof rows)[number]>();
  let wildcard: (typeof rows)[number] | undefined;
  for (const row of rows) {
    if (row.productId === "*") {
      wildcard = row;
    } else {
      byProductId.set(row.productId, row);
    }
  }

  const out: Record<string, ProductRulePayload> = {};

  for (const key of keys) {
    const row = byProductId.get(key) ?? wildcard;
    if (!row) continue;

    const tiersRaw = row.tiers;
    const tiers: FunctionTierConfig[] = [];
    if (Array.isArray(tiersRaw)) {
      for (const t of tiersRaw) {
        if (!t || typeof t !== "object") continue;
        const o = t as Record<string, unknown>;
        const minQty = Math.max(
          1,
          Math.floor(Number(o.minQuantity ?? o.minQty ?? 1)),
        );
        const type = String(o.discountType ?? "").toLowerCase();
        if (type === "percentage" || type === "percent") {
          tiers.push({ minQty, percent: Number(o.value) });
        } else if (type === "fixed_price" || type === "fixed-price") {
          tiers.push({ minQty, fixedPricePerUnit: Number(o.value) });
        } else if (type === "fixed") {
          tiers.push({
            minQty,
            fixedAmount: Number(o.value),
            appliesToEachItem: Boolean(o.appliesToEachItem),
          });
        }
      }
    }

    out[key] = {
      campaignId: row.campaignId,
      status: "active",
      label:
        row.displayName?.trim() ||
        row.campaignName?.trim() ||
        "Volume discount",
      quantityCondition: row.quantityCondition,
      customerType: row.customerType,
      customerTags: Array.isArray(row.customerTags)
        ? row.customerTags.filter(
            (x: unknown): x is string => typeof x === "string",
          )
        : [],
      tiers,
    };
  }

  return out;
}
