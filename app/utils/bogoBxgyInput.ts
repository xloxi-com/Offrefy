import type { BogoCampaignInput, BogoItemScope } from "../types/bogo";

export type BxgyCombinesWith = {
  productDiscounts: boolean;
  orderDiscounts: boolean;
  shippingDiscounts: boolean;
};

export type BxgyItemsPrevious = {
  scope: BogoItemScope;
  productIds: string[];
  collectionIds: string[];
};

function itemDiff(
  previous: string[],
  next: string[],
): { toAdd: string[]; toRemove: string[] } {
  const prevSet = new Set(previous);
  const nextSet = new Set(next);
  return {
    toAdd: next.filter((id) => !prevSet.has(id)),
    toRemove: previous.filter((id) => !nextSet.has(id)),
  };
}

/**
 * Build DiscountItemsInput for customerBuys / customerGets.
 * Create: add only. Update: add/remove diffs, including product↔collection scope switches.
 */
export function buildBxgyItemsInput(
  scope: BogoItemScope,
  productIds: string[],
  collectionIds: string[],
  previous: BxgyItemsPrevious | null,
  isCreate: boolean,
): Record<string, unknown> {
  if (isCreate || !previous) {
    if (scope === "collections") {
      return { collections: { add: collectionIds } };
    }
    return { products: { productsToAdd: productIds } };
  }

  const items: Record<string, unknown> = {};

  if (previous.scope !== scope) {
    if (previous.scope === "products" && previous.productIds.length) {
      items.products = { productsToRemove: previous.productIds };
    }
    if (previous.scope === "collections" && previous.collectionIds.length) {
      items.collections = { remove: previous.collectionIds };
    }
    if (scope === "collections") {
      items.collections = {
        ...((items.collections as object) || {}),
        add: collectionIds,
      };
    } else {
      items.products = {
        ...((items.products as object) || {}),
        productsToAdd: productIds,
      };
    }
    return items;
  }

  if (scope === "collections") {
    const { toAdd, toRemove } = itemDiff(
      previous.collectionIds,
      collectionIds,
    );
    const collections: Record<string, string[]> = {};
    if (toAdd.length) collections.add = toAdd;
    if (toRemove.length) collections.remove = toRemove;
    if (Object.keys(collections).length) items.collections = collections;
    return items;
  }

  const { toAdd, toRemove } = itemDiff(previous.productIds, productIds);
  const products: Record<string, string[]> = {};
  if (toAdd.length) products.productsToAdd = toAdd;
  if (toRemove.length) products.productsToRemove = toRemove;
  if (Object.keys(products).length) items.products = products;
  return items;
}

/**
 * BXGY customerGets.value must use discountOnQuantity.
 * Top-level percentage / discountAmount are not permitted for BXGY
 * (Admin API DiscountCustomerGetsValueInput notes).
 *
 * DiscountEffectInput.percentage is a 0.00–1.00 ratio:
 * - free → percentage: 1  (100% off — NOT 1%)
 * - percentage → merchant 0–100 → ratio / 100
 * - amount → Decimal off each Y item
 */
export function buildBxgyGetsEffect(
  getsValueType: BogoCampaignInput["getsValueType"],
  getsValue: string | null,
): Record<string, unknown> {
  if (getsValueType === "free") {
    return { percentage: 1 };
  }
  if (getsValueType === "percentage") {
    const pct = Number.parseFloat(getsValue ?? "0");
    const ratio = Math.min(1, Math.max(0, pct / 100));
    return { percentage: ratio };
  }
  /* Fixed amount off each eligible Get item (DiscountEffectInput.amount). */
  return { amount: getsValue ?? "0.01" };
}

export type BuildAutomaticBxgyOptions = {
  previousBuys?: BxgyItemsPrevious | null;
  previousGets?: BxgyItemsPrevious | null;
  isCreate?: boolean;
  combinesWith?: BxgyCombinesWith | null;
};

/**
 * Maps OFFREFY BOGO campaign fields → DiscountAutomaticBxgyInput (Admin API).
 * Dates must already be absolute UTC instants (shop TZ converted in the form layer).
 */
export function buildAutomaticBxgyInput(
  data: BogoCampaignInput,
  options?: BuildAutomaticBxgyOptions,
): Record<string, unknown> {
  const isCreate = options?.isCreate !== false;
  const customerBuysValue =
    data.buysRequirement === "amount"
      ? { amount: data.buysAmount ?? "0.01" }
      : { quantity: String(data.buysQuantity ?? 1) };

  const buysItems = buildBxgyItemsInput(
    data.buysScope,
    data.buysProductIds,
    data.buysCollectionIds,
    options?.previousBuys ?? null,
    isCreate,
  );
  const getsItems = buildBxgyItemsInput(
    data.getsScope,
    data.getsProductIds,
    data.getsCollectionIds,
    options?.previousGets ?? null,
    isCreate,
  );

  const customerBuys: Record<string, unknown> = {
    value: customerBuysValue,
  };
  if (Object.keys(buysItems).length) {
    customerBuys.items = buysItems;
  }

  const customerGets: Record<string, unknown> = {
    value: {
      discountOnQuantity: {
        quantity: String(Math.max(1, data.getsQuantity || 1)),
        effect: buildBxgyGetsEffect(data.getsValueType, data.getsValue),
      },
    },
  };
  if (Object.keys(getsItems).length) {
    customerGets.items = getsItems;
  }

  const input: Record<string, unknown> = {
    title: data.displayName || data.campaignName,
    startsAt: data.startsAt.toISOString(),
    endsAt: data.endsAt ? data.endsAt.toISOString() : null,
    customerBuys,
    customerGets,
  };

  if (options?.combinesWith) {
    input.combinesWith = {
      productDiscounts: Boolean(options.combinesWith.productDiscounts),
      orderDiscounts: Boolean(options.combinesWith.orderDiscounts),
      shippingDiscounts: Boolean(options.combinesWith.shippingDiscounts),
    };
  }

  /*
   * UnsignedInt64 — Shopify examples pass a string. null clears the limit on update
   * (unlimited). Omit on create when unlimited.
   */
  if (data.usesPerOrderLimit != null && data.usesPerOrderLimit > 0) {
    input.usesPerOrderLimit = String(data.usesPerOrderLimit);
  } else if (!isCreate) {
    input.usesPerOrderLimit = null;
  }

  return input;
}

export function previousItemsFromRow(row: {
  buysScope: string;
  buysProductIds: unknown;
  buysCollectionIds: unknown;
  getsScope: string;
  getsProductIds: unknown;
  getsCollectionIds: unknown;
}): { buys: BxgyItemsPrevious; gets: BxgyItemsPrevious } {
  const asIds = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((x): x is string => typeof x === "string" && Boolean(x));
  };
  return {
    buys: {
      scope: row.buysScope === "collections" ? "collections" : "products",
      productIds: asIds(row.buysProductIds),
      collectionIds: asIds(row.buysCollectionIds),
    },
    gets: {
      scope: row.getsScope === "collections" ? "collections" : "products",
      productIds: asIds(row.getsProductIds),
      collectionIds: asIds(row.getsCollectionIds),
    },
  };
}
