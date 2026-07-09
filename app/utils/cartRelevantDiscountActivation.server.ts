/**
 * Cart → discount activation planning for Shopify’s automatic discount limit.
 *
 * Shopify enforces a store-wide cap on **active** automatic discounts (documented as 25).
 * This module computes which discount node IDs should stay **active** vs be **deactivated**
 * (merchant-admin “draft-like” off state uses `discountAutomaticDeactivate`).
 *
 * **Important:** Do not call Admin GraphQL from the public storefront on every cart change —
 * discounts are shop-wide; concurrent shoppers would fight each other. Use this from
 * authenticated admin flows, scheduled jobs, or other controlled contexts.
 */

/** Shopify’s documented cap for active automatic discounts per shop. */
export const SHOPIFY_MAX_ACTIVE_AUTOMATIC_DISCOUNTS = 25;

export type CartRelevantDiscountInput = {
  /** Product IDs currently in the cart (numeric strings or `gid://shopify/Product/...`). */
  cartProductIds: readonly string[];
  /**
   * Each product ID → discount node IDs (`gid://shopify/DiscountAutomaticNode/...`)
   * that implement that product’s offers.
   */
  productToDiscountIds: Readonly<Record<string, readonly string[]>>;
  /**
   * Full set of discount IDs your integration manages. Defaults to every ID appearing
   * in `productToDiscountIds`.
   */
  allDiscountIds?: readonly string[];
};

export type CartRelevantDiscountResult = {
  /** Up to {@link SHOPIFY_MAX_ACTIVE_AUTOMATIC_DISCOUNTS} discounts that should stay active. */
  activeDiscounts: string[];
  /** All other managed discounts (irrelevant to cart, or relevant but over cap). */
  draftDiscounts: string[];
};

function normalizeDiscountId(raw: unknown): string {
  return String(raw ?? "").trim();
}

/** Normalize product identifiers so cart lines and map keys match. */
export function normalizeProductIdKey(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/\/Product\/(\d+)/);
  if (m) return m[1]!;
  if (/^\d+$/.test(s)) return s;
  return s;
}

function mergeProductDiscountMapping(
  productToDiscountIds: Readonly<Record<string, readonly string[]>>,
): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  for (const [rawKey, rawIds] of Object.entries(productToDiscountIds)) {
    const k = normalizeProductIdKey(rawKey);
    if (!k) continue;
    const ids = Array.isArray(rawIds) ? rawIds : [];
    const bucket = merged.get(k) ?? [];
    for (const id of ids) {
      const d = normalizeDiscountId(id);
      if (d) bucket.push(d);
    }
    merged.set(k, bucket);
  }
  return merged;
}

function uniqueCartProductOrder(
  cartProductIds: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cartProductIds) {
    const k = normalizeProductIdKey(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function collectAllManagedDiscountIds(
  input: CartRelevantDiscountInput,
): string[] {
  if (input.allDiscountIds != null && input.allDiscountIds.length > 0) {
    const s = new Set<string>();
    for (const id of input.allDiscountIds) {
      const d = normalizeDiscountId(id);
      if (d) s.add(d);
    }
    return [...s];
  }
  const s = new Set<string>();
  for (const ids of Object.values(input.productToDiscountIds)) {
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      const d = normalizeDiscountId(id);
      if (d) s.add(d);
    }
  }
  return [...s];
}

/**
 * Decide which automatic discounts stay active (≤25) for the current cart’s products.
 *
 * - **Relevant** = any discount linked from a cart product in `productToDiscountIds`.
 * - **Active** = first N relevant discounts in cart line order (N ≤ 25).
 * - **Draft / off** = every managed discount ID not in **active** (includes irrelevant + relevant beyond cap).
 */
export function computeCartRelevantDiscountState(
  input: CartRelevantDiscountInput,
): CartRelevantDiscountResult {
  const merged = mergeProductDiscountMapping(input.productToDiscountIds);
  const cartOrder = uniqueCartProductOrder(input.cartProductIds);

  const relevantOrdered: string[] = [];
  const seenDiscount = new Set<string>();
  for (const productKey of cartOrder) {
    const list = merged.get(productKey);
    if (!list?.length) continue;
    for (const d of list) {
      if (seenDiscount.has(d)) continue;
      seenDiscount.add(d);
      relevantOrdered.push(d);
    }
  }

  const activeDiscounts = relevantOrdered.slice(
    0,
    SHOPIFY_MAX_ACTIVE_AUTOMATIC_DISCOUNTS,
  );
  const activeSet = new Set(activeDiscounts);

  const allManaged = collectAllManagedDiscountIds(input);
  const draftDiscounts = allManaged.filter((id) => !activeSet.has(id));

  return { activeDiscounts, draftDiscounts };
}
