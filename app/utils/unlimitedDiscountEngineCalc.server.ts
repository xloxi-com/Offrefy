import type { VolumeDiscountCampaign } from "@prisma/client";
import type { TierPayload } from "../types/volumeDiscount";
import { normalizeVolumeDiscountCustomerType } from "../types/volumeDiscount";
import { normalizeTiersFromDb } from "./volumeDiscountTier";

/** Fields read by the calc engine — allows `select` in the app-proxy loader. */
export type DiscountEngineCampaignRow = Pick<
  VolumeDiscountCampaign,
  | "id"
  | "campaignName"
  | "displayName"
  | "productScope"
  | "quantityCondition"
  | "customerType"
  | "customerTags"
  | "productIds"
  | "tiers"
  | "widgetDisplay"
  | "status"
  | "createdAt"
>;

/** POST /apps/volume-discount/calc */
export type DiscountEngineCalcItemIn = {
  product_id: string;
  variant_id: string;
  quantity: number;
  /** Line subtotal in cents (presentment); required for pricing math */
  line_subtotal_cents: number;
};

export type DiscountEngineCalcRequest = {
  items: DiscountEngineCalcItemIn[];
  /** For customer-scoped offers */
  customer_logged_in?: boolean;
  customer_tags?: string[];
};

export type AppliedOfferPreview = {
  offer_id: string;
  title: string;
  value: number;
  type: "percentage" | "fixed" | "fixed_price_per_unit";
};

export type DiscountEngineCalcLineOut = {
  variant_id: string;
  product_id: string;
  quantity: number;
  original_cents: number;
  discounted_cents: number;
  applied_offers: AppliedOfferPreview[];
};

export type DiscountEngineCalcResponse = {
  ok: true;
  items: DiscountEngineCalcLineOut[];
  cart_total: { original_cents: number; discounted_cents: number };
};

export type FunctionTierConfig = {
  minQty: number;
  percent?: number;
  fixedAmount?: number;
  appliesToEachItem?: boolean;
  fixedPricePerUnit?: number;
};

function isPercentValueUnit(valueUnit: string): boolean {
  const u = valueUnit.trim().toLowerCase();
  return (
    u === "%" || u === "percent" || u === "percentage" || u === "pct"
  );
}

function minQtyFromBuyFrom(buyFrom: string): number {
  const s = buyFrom.trim();
  const leading = s.match(/^(\d+)/);
  if (leading) {
    return Math.max(1, Math.floor(parseInt(leading[1], 10) || 1));
  }
  const n = parseInt(s, 10);
  return Math.max(1, Math.floor(Number.isFinite(n) ? n : 1));
}

function tierToFunctionTier(t: TierPayload): FunctionTierConfig | null {
  const minQty = minQtyFromBuyFrom(t.buyFrom);
  const raw = parseFloat(t.value);
  if (!Number.isFinite(raw) || raw < 0) return null;

  if (isPercentValueUnit(t.valueUnit)) {
    let pct = raw;
    if (pct > 0 && pct <= 1) pct = pct * 100;
    if (pct < 0 || pct > 100) return null;
    return { minQty, percent: pct };
  }

  if (t.valueUnit === "fixed-price") {
    if (raw <= 0) return null;
    return { minQty, fixedPricePerUnit: raw };
  }

  if (t.valueUnit === "amount-each") {
    return { minQty, fixedAmount: raw, appliesToEachItem: true };
  }

  return {
    minQty,
    fixedAmount: raw,
    appliesToEachItem: t.discountMode === "per-item",
  };
}

function bestTiersFromPayload(tiers: TierPayload[]): FunctionTierConfig[] {
  const out: FunctionTierConfig[] = [];
  for (const t of tiers) {
    const ft = tierToFunctionTier(t);
    if (ft) out.push(ft);
  }
  return out.sort((a, b) => a.minQty - b.minQty);
}

function pickTier(tiers: FunctionTierConfig[], qty: number): FunctionTierConfig | null {
  let best: FunctionTierConfig | null = null;
  for (const t of tiers) {
    if (qty >= t.minQty) best = t;
    else break;
  }
  return best;
}

function canonicalProductGid(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/\/Product\/(\d+)/);
  if (m) return `gid://shopify/Product/${m[1]}`;
  if (/^\d+$/.test(s)) return `gid://shopify/Product/${s}`;
  return "";
}

function lineMatchesProductIds(
  scope: string,
  productIds: unknown,
  productIdRaw: string,
  variantId: string,
): boolean {
  if (scope === "all") return true;
  const og = canonicalProductGid(productIdRaw);
  const pNum = og.match(/\/Product\/(\d+)/)?.[1] ?? "";
  const v = String(variantId ?? "").trim();
  const ids = Array.isArray(productIds) ? productIds.map(String) : [];
  for (const s of ids) {
    if (!s) continue;
    if (og && s === og) return true;
    if (v && s === v) return true;
    if (pNum && s.indexOf("/Product/" + pNum) !== -1) return true;
    if (v && s.indexOf("/Variant/" + v) !== -1) return true;
    if (pNum && s === pNum) return true;
    if (/^\d+$/.test(v) && s === v) return true;
  }
  return false;
}

function stackPriority(row: DiscountEngineCampaignRow): number {
  const o = row.widgetDisplay as Record<string, unknown> | null;
  const sp = o?.stackPriority;
  if (typeof sp === "number" && Number.isFinite(sp)) return sp;
  if (typeof sp === "string" && String(sp).trim()) {
    const n = parseInt(String(sp), 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function customerMatches(
  row: DiscountEngineCampaignRow,
  loggedIn: boolean,
  tags: string[],
): boolean {
  const t = normalizeVolumeDiscountCustomerType(String(row.customerType ?? "everyone"));
  if (t === "everyone") return true;
  if (t === "logged-in") return loggedIn;
  if (t === "logged-in-tag-any") {
    if (!loggedIn) return false;
    const need = Array.isArray(row.customerTags)
      ? (row.customerTags as unknown[]).map(String)
      : [];
    if (need.length === 0) return false;
    const set = new Set(tags.map((x) => x.trim()).filter(Boolean));
    return need.some((tag) => set.has(tag));
  }
  return false;
}

function qtyForCampaign(
  row: DiscountEngineCampaignRow,
  line: DiscountEngineCalcItemIn,
  allItems: DiscountEngineCalcItemIn[],
): number {
  const mode = String(row.quantityCondition ?? "per-variant");
  if (mode === "total-all") {
    return allItems.reduce((s, x) => s + Math.max(0, Math.floor(x.quantity)), 0);
  }
  if (mode === "per-product") {
    const pg = canonicalProductGid(line.product_id);
    return allItems
      .filter((x) => canonicalProductGid(x.product_id) === pg)
      .reduce((s, x) => s + Math.max(0, Math.floor(x.quantity)), 0);
  }
  return Math.max(0, Math.floor(line.quantity));
}

function discountCentsFromTier(
  remainingSubtotalCents: number,
  qty: number,
  tier: FunctionTierConfig,
): { cents: number; type: AppliedOfferPreview["type"] } {
  if (remainingSubtotalCents <= 0 || qty <= 0) {
    return { cents: 0, type: "percentage" };
  }
  if (tier.percent != null) {
    const pct = tier.percent;
    const d = Math.min(
      remainingSubtotalCents,
      Math.round((remainingSubtotalCents * pct) / 100),
    );
    return { cents: d, type: "percentage" };
  }
  if (tier.fixedPricePerUnit != null) {
    const fp = tier.fixedPricePerUnit;
    const targetCents = Math.round(fp * qty * 100);
    const d = Math.min(remainingSubtotalCents, Math.max(0, remainingSubtotalCents - targetCents));
    return { cents: d, type: "fixed_price_per_unit" };
  }
  if (tier.fixedAmount != null) {
    const faCents = Math.round(tier.fixedAmount * 100);
    const d = tier.appliesToEachItem
      ? Math.min(remainingSubtotalCents, faCents * qty)
      : Math.min(remainingSubtotalCents, faCents);
    return { cents: d, type: "fixed" };
  }
  return { cents: 0, type: "percentage" };
}

/**
 * Runtime-only price preview for cart drawer (no Shopify discount activation).
 * Stacks matching campaigns by stackPriority (desc), then createdAt (desc).
 */
export function computeUnlimitedDiscountPreview(
  campaigns: DiscountEngineCampaignRow[],
  body: DiscountEngineCalcRequest,
): DiscountEngineCalcResponse {
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return {
      ok: true,
      items: [],
      cart_total: { original_cents: 0, discounted_cents: 0 },
    };
  }

  const loggedIn = Boolean(body.customer_logged_in);
  const tags = Array.isArray(body.customer_tags)
    ? body.customer_tags.map(String)
    : [];

  const active = campaigns.filter((c) => c.status === "active");

  const sortedCampaigns = [...active].sort((a, b) => {
    const pa = stackPriority(a);
    const pb = stackPriority(b);
    if (pb !== pa) return pb - pa;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  function parseFunctionTiersFromDbRule(rawTiers: unknown): FunctionTierConfig[] {
    const arr = Array.isArray(rawTiers) ? rawTiers : [];
    const out: FunctionTierConfig[] = [];
    for (const t of arr) {
      if (!t || typeof t !== "object") continue;
      const minQty = Math.max(1, Math.floor(Number(t.minQuantity ?? t.minQty ?? 1)));
      const val = Number(t.value ?? 0);
      const type = String(t.discountType ?? "").toLowerCase();

      if (t.percent != null) {
        out.push({ minQty, percent: Number(t.percent) });
      } else if (t.fixedPricePerUnit != null) {
        out.push({ minQty, fixedPricePerUnit: Number(t.fixedPricePerUnit) });
      } else if (t.fixedAmount != null) {
        out.push({ minQty, fixedAmount: Number(t.fixedAmount), appliesToEachItem: Boolean(t.appliesToEachItem) });
      } else if (type === "percentage" || type === "percent") {
        out.push({ minQty, percent: val });
      } else if (type === "fixed_price" || type === "fixed_price_per_unit") {
        out.push({ minQty, fixedPricePerUnit: val });
      } else if (type === "fixed" || type === "fixed_amount") {
        out.push({ minQty, fixedAmount: val, appliesToEachItem: Boolean(t.appliesToEachItem || t.each) });
      }
    }
    return out.sort((a, b) => a.minQty - b.minQty);
  }

  /** Per-request tier cache — same tiers reused across cart lines for one campaign. */
  const tiersByCampaignId = new Map<string, FunctionTierConfig[]>();
  function tiersForCampaign(row: DiscountEngineCampaignRow): FunctionTierConfig[] {
    let cached = tiersByCampaignId.get(row.id);
    if (!cached) {
      const rawTiers = row.tiers as any;
      const isCampaignFormat = Array.isArray(rawTiers) && rawTiers.length > 0 && typeof rawTiers[0] === "object" && rawTiers[0].buyFrom !== undefined;
      
      if (isCampaignFormat) {
        cached = bestTiersFromPayload(normalizeTiersFromDb(rawTiers));
      } else {
        cached = parseFunctionTiersFromDbRule(rawTiers);
      }
      tiersByCampaignId.set(row.id, cached);
    }
    return cached;
  }

  /** Customer filter is identical for every line in one calc request. */
  const customerEligible = sortedCampaigns.filter((row) =>
    customerMatches(row, loggedIn, tags),
  );

  const MAX_DISCOUNT_CART_PRODUCTS = 500;
  const discountedProductIds = new Set<string>();

  const outItems: DiscountEngineCalcLineOut[] = [];
  let totalOrig = 0;
  let totalDisc = 0;

  for (const line of items) {
    const qty = Math.max(0, Math.floor(line.quantity));
    const orig = Math.max(0, Math.round(Number(line.line_subtotal_cents)));
    totalOrig += orig;

    const productId = String(line.product_id ?? "").trim();
    const variantId = String(line.variant_id ?? "").trim();

    if (
      qty <= 0 ||
      orig <= 0 ||
      (!discountedProductIds.has(productId) &&
        discountedProductIds.size >= MAX_DISCOUNT_CART_PRODUCTS)
    ) {
      outItems.push({
        variant_id: variantId,
        product_id: productId,
        quantity: qty,
        original_cents: orig,
        discounted_cents: orig,
        applied_offers: [],
      });
      totalDisc += orig;
      continue;
    }

    const matching: DiscountEngineCampaignRow[] = [];
    for (const row of customerEligible) {
      const scope = String(row.productScope ?? "all");
      if (
        !lineMatchesProductIds(
          scope,
          row.productIds,
          line.product_id,
          variantId,
        )
      ) {
        continue;
      }

      matching.push(row);
    }

    let remaining = orig;
    const applied: AppliedOfferPreview[] = [];

    for (const row of matching) {
      const tiers = tiersForCampaign(row);
      if (!tiers.length) continue;

      const q = qtyForCampaign(row, line, items);
      const tier = pickTier(tiers, q);
      if (!tier) continue;

      const { cents: d, type } = discountCentsFromTier(remaining, qty, tier);
      if (d <= 0) continue;

      let value = 0;
      if (type === "percentage" && tier.percent != null) value = tier.percent;
      else if (type === "fixed_price_per_unit" && tier.fixedPricePerUnit != null)
        value = tier.fixedPricePerUnit;
      else if (tier.fixedAmount != null) value = tier.fixedAmount;

      applied.push({
        offer_id: row.id,
        title:
          (typeof row.displayName === "string" && row.displayName.trim()) ||
          row.campaignName,
        value,
        type,
      });
      remaining -= d;
      if (remaining <= 0) break;
    }

    const finalCents = Math.max(0, remaining);
    totalDisc += finalCents;

    if (applied.length > 0) {
      discountedProductIds.add(productId);
    }

    outItems.push({
      variant_id: variantId,
      product_id: productId,
      quantity: qty,
      original_cents: orig,
      discounted_cents: finalCents,
      applied_offers: applied,
    });
  }

  return {
    ok: true,
    items: outItems,
    cart_total: {
      original_cents: totalOrig,
      discounted_cents: totalDisc,
    },
  };
}
