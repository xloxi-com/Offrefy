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
 * Diffs against existing rows so unchanged catalogs skip delete+rewrite.
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

  const desiredRows: import("../types/discountRule").DiscountRuleCreateInput[] =
    [];
  const desiredFingerprint = new Map<string, string>();
  for (const [productId, campaign] of winner) {
    const row = {
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
    };
    desiredRows.push(row);
    desiredFingerprint.set(productId, discountRuleFingerprint(row));
  }

  const existing = await discountRuleDb().findMany({
    where: { shop },
    select: {
      id: true,
      productId: true,
      campaignId: true,
      status: true,
      tiers: true,
      quantityCondition: true,
      customerType: true,
      customerTags: true,
      displayName: true,
      campaignName: true,
    },
  });

  // Unique is (shop, campaignId, productId) — many rows can share productId.
  // Index by productId with ALL matches so orphans from older winners are deleted.
  const existingByProduct = new Map<string, typeof existing>();
  for (const row of existing) {
    const list = existingByProduct.get(row.productId);
    if (list) list.push(row);
    else existingByProduct.set(row.productId, [row]);
  }

  const idsToDelete: string[] = [];
  const rowsToCreate: import("../types/discountRule").DiscountRuleCreateInput[] =
    [];

  for (const row of desiredRows) {
    const prevs = existingByProduct.get(row.productId) ?? [];
    existingByProduct.delete(row.productId);
    const wantFp = desiredFingerprint.get(row.productId);
    const keep = prevs.find(
      (prev) =>
        prev.campaignId === row.campaignId &&
        discountRuleFingerprint(prev) === wantFp,
    );
    for (const prev of prevs) {
      if (keep && prev.id === keep.id) continue;
      if (prev.id) idsToDelete.push(prev.id);
    }
    if (!keep) rowsToCreate.push(row);
  }

  for (const leftovers of existingByProduct.values()) {
    for (const leftover of leftovers) {
      if (leftover.id) idsToDelete.push(leftover.id);
    }
  }

  const DELETE_BATCH = 500;
  for (let i = 0; i < idsToDelete.length; i += DELETE_BATCH) {
    await discountRuleDb().deleteMany({
      where: { shop, id: { in: idsToDelete.slice(i, i + DELETE_BATCH) } },
    });
  }

  const CREATE_BATCH = 500;
  for (let i = 0; i < rowsToCreate.length; i += CREATE_BATCH) {
    await discountRuleDb().createMany({
      data: rowsToCreate.slice(i, i + CREATE_BATCH),
      skipDuplicates: true,
    });
  }

  return { ruleCount: desiredRows.length };
}

function discountRuleFingerprint(row: {
  campaignId: string;
  status?: string;
  tiers: unknown;
  quantityCondition: string;
  customerType: string;
  customerTags: unknown;
  displayName?: string | null;
  campaignName?: string | null;
}): string {
  return JSON.stringify({
    campaignId: row.campaignId,
    status: row.status ?? "active",
    tiers: row.tiers,
    quantityCondition: row.quantityCondition,
    customerType: row.customerType,
    customerTags: row.customerTags,
    displayName: row.displayName ?? null,
    campaignName: row.campaignName ?? null,
  });
}

/** Lookup active rules for cart product ids (used by app-proxy / network-access fetch). */
export async function lookupDiscountRulesForProducts(
  shop: string,
  productIds: string[],
  options?: { maxProducts?: number },
): Promise<Record<string, ProductRulePayload>> {
  const maxProducts = Math.min(
    Math.max(1, options?.maxProducts ?? 25),
    25,
  );
  const keys = [
    ...new Set(
      productIds.map(normalizeProductIdKey).filter(Boolean),
    ),
  ].slice(0, maxProducts);
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
