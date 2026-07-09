import { normalizeProductIdKey } from "./cartRelevantDiscountActivation.server";

export type ProductDiscountFilterCartLine = {
  product_id: string;
  quantity: number;
};

export type ProductDiscountFilterCart = {
  lines: ProductDiscountFilterCartLine[];
};

export type ProductDiscountType = "percentage" | "fixed";

export type ProductDiscountRecord = {
  product_id: string;
  discount_id: string;
  value: number;
  type: ProductDiscountType;
  /** Higher runs first when `sort` is `priority-then-value` (default). */
  priority?: number;
};

export type ProductDiscountFilterInput = {
  cart: ProductDiscountFilterCart;
  discount_database: ProductDiscountRecord[];
};

export type AppliedProductDiscount = {
  discount_id: string;
  product_id: string;
  value: number;
  type: ProductDiscountType;
};

export type ProductDiscountFilterOptions = {
  /** Maximum discounts returned (default 25). */
  maxDiscounts?: number;
  /**
   * - `priority-then-value` — higher `priority`, then higher `value`
   * - `value-desc` — by `value` only
   * - `none` — stable order of first match in database after filter
   */
  sort?: "priority-then-value" | "value-desc" | "none";
};

const DEFAULT_MAX = 25;

function cartProductIdSet(cart: ProductDiscountFilterCart): Set<string> {
  const s = new Set<string>();
  for (const line of cart.lines ?? []) {
    const k = normalizeProductIdKey(line.product_id);
    if (k) s.add(k);
  }
  return s;
}

function normalizeRecordProductId(record: ProductDiscountRecord): string {
  return normalizeProductIdKey(record.product_id);
}

/**
 * Returns discounts from `discount_database` whose `product_id` appears in `cart.lines`,
 * optionally sorted, capped at `maxDiscounts` (25 by default).
 */
export function productDiscountFilter(
  input: ProductDiscountFilterInput,
  options?: ProductDiscountFilterOptions,
): { applied_discounts: AppliedProductDiscount[] } {
  const maxDiscounts = Math.min(
    Math.max(1, options?.maxDiscounts ?? DEFAULT_MAX),
    DEFAULT_MAX,
  );
  const sort = options?.sort ?? "priority-then-value";

  const inCart = cartProductIdSet(input.cart);
  const matched: AppliedProductDiscount[] = [];

  for (const row of input.discount_database ?? []) {
    const pid = normalizeRecordProductId(row);
    if (!pid || !inCart.has(pid)) continue;
    if (
      typeof row.discount_id !== "string" ||
      !Number.isFinite(Number(row.value))
    ) {
      continue;
    }
    const t = row.type === "fixed" ? "fixed" : "percentage";
    matched.push({
      discount_id: String(row.discount_id).trim(),
      product_id: pid,
      value: Number(row.value),
      type: t,
    });
  }

  if (sort === "none") {
    return {
      applied_discounts: matched.slice(0, maxDiscounts),
    };
  }

  const withPriority = matched.map((m, i) => {
    const src = input.discount_database.find(
      (r) =>
        normalizeRecordProductId(r) === m.product_id &&
        String(r.discount_id).trim() === m.discount_id,
    );
    const p =
      src && typeof src.priority === "number" && Number.isFinite(src.priority)
        ? src.priority
        : 0;
    return { m, p, i };
  });

  if (sort === "value-desc") {
    withPriority.sort((a, b) => {
      if (b.m.value !== a.m.value) return b.m.value - a.m.value;
      return a.i - b.i;
    });
  } else {
    withPriority.sort((a, b) => {
      if (b.p !== a.p) return b.p - a.p;
      if (b.m.value !== a.m.value) return b.m.value - a.m.value;
      return a.i - b.i;
    });
  }

  return {
    applied_discounts: withPriority.slice(0, maxDiscounts).map((x) => x.m),
  };
}
