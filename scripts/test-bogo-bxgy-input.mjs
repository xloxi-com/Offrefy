/**
 * Lightweight assertions for BOGO → DiscountAutomaticBxgyInput mapping.
 * Run: node scripts/test-bogo-bxgy-input.mjs
 */
import assert from "node:assert/strict";

function itemDiff(previous, next) {
  const prevSet = new Set(previous);
  const nextSet = new Set(next);
  return {
    toAdd: next.filter((id) => !prevSet.has(id)),
    toRemove: previous.filter((id) => !nextSet.has(id)),
  };
}

function buildBxgyItemsInput(scope, productIds, collectionIds, previous, isCreate) {
  if (isCreate || !previous) {
    if (scope === "collections") return { collections: { add: collectionIds } };
    return { products: { productsToAdd: productIds } };
  }
  const items = {};
  if (previous.scope !== scope) {
    if (previous.scope === "products" && previous.productIds.length) {
      items.products = { productsToRemove: previous.productIds };
    }
    if (previous.scope === "collections" && previous.collectionIds.length) {
      items.collections = { remove: previous.collectionIds };
    }
    if (scope === "collections") {
      items.collections = { ...(items.collections || {}), add: collectionIds };
    } else {
      items.products = { ...(items.products || {}), productsToAdd: productIds };
    }
    return items;
  }
  if (scope === "collections") {
    const { toAdd, toRemove } = itemDiff(previous.collectionIds, collectionIds);
    const collections = {};
    if (toAdd.length) collections.add = toAdd;
    if (toRemove.length) collections.remove = toRemove;
    if (Object.keys(collections).length) items.collections = collections;
    return items;
  }
  const { toAdd, toRemove } = itemDiff(previous.productIds, productIds);
  const products = {};
  if (toAdd.length) products.productsToAdd = toAdd;
  if (toRemove.length) products.productsToRemove = toRemove;
  if (Object.keys(products).length) items.products = products;
  return items;
}

function buildBxgyGetsEffect(getsValueType, getsValue) {
  if (getsValueType === "free") return { percentage: 1 };
  if (getsValueType === "percentage") {
    const pct = Number.parseFloat(getsValue ?? "0");
    return { percentage: Math.min(1, Math.max(0, pct / 100)) };
  }
  return { amount: getsValue ?? "0.01" };
}

function buildAutomaticBxgyInput(data, options = {}) {
  const isCreate = options.isCreate !== false;
  const customerBuysValue =
    data.buysRequirement === "amount"
      ? { amount: data.buysAmount ?? "0.01" }
      : { quantity: String(data.buysQuantity ?? 1) };
  const buysItems = buildBxgyItemsInput(
    data.buysScope,
    data.buysProductIds,
    data.buysCollectionIds,
    options.previousBuys ?? null,
    isCreate,
  );
  const getsItems = buildBxgyItemsInput(
    data.getsScope,
    data.getsProductIds,
    data.getsCollectionIds,
    options.previousGets ?? null,
    isCreate,
  );
  const customerBuys = { value: customerBuysValue };
  if (Object.keys(buysItems).length) customerBuys.items = buysItems;
  const customerGets = {
    value: {
      discountOnQuantity: {
        quantity: String(Math.max(1, data.getsQuantity || 1)),
        effect: buildBxgyGetsEffect(data.getsValueType, data.getsValue),
      },
    },
  };
  if (Object.keys(getsItems).length) customerGets.items = getsItems;
  const input = {
    title: data.displayName || data.campaignName,
    startsAt: data.startsAt.toISOString(),
    endsAt: data.endsAt ? data.endsAt.toISOString() : null,
    customerBuys,
    customerGets,
  };
  if (options.combinesWith) {
    input.combinesWith = {
      productDiscounts: Boolean(options.combinesWith.productDiscounts),
      orderDiscounts: Boolean(options.combinesWith.orderDiscounts),
      shippingDiscounts: Boolean(options.combinesWith.shippingDiscounts),
    };
  }
  if (data.usesPerOrderLimit != null && data.usesPerOrderLimit > 0) {
    input.usesPerOrderLimit = String(data.usesPerOrderLimit);
  } else if (!isCreate) {
    input.usesPerOrderLimit = null;
  }
  return input;
}

const base = {
  campaignName: "Test",
  displayName: "BOGO Test",
  status: "active",
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: new Date("2026-12-31T23:59:59.000Z"),
  buysRequirement: "quantity",
  buysQuantity: 2,
  buysAmount: null,
  buysScope: "products",
  buysProductIds: ["gid://shopify/Product/1"],
  buysCollectionIds: [],
  getsQuantity: 1,
  getsScope: "products",
  getsProductIds: ["gid://shopify/Product/1"],
  getsCollectionIds: [],
  getsValueType: "free",
  getsValue: null,
  usesPerOrderLimit: 1,
};

/* Same-product BOGO free */
{
  const input = buildAutomaticBxgyInput(base, {
    isCreate: true,
    combinesWith: {
      productDiscounts: true,
      orderDiscounts: false,
      shippingDiscounts: true,
    },
  });
  assert.equal(input.customerBuys.value.quantity, "2");
  assert.deepEqual(input.customerGets.value.discountOnQuantity, {
    quantity: "1",
    effect: { percentage: 1 },
  });
  assert.equal(input.usesPerOrderLimit, "1");
  assert.equal(input.combinesWith.productDiscounts, true);
  assert.deepEqual(input.customerBuys.items.products.productsToAdd, [
    "gid://shopify/Product/1",
  ]);
}

/* Cross-product percentage + spend condition */
{
  const input = buildAutomaticBxgyInput(
    {
      ...base,
      buysRequirement: "amount",
      buysQuantity: null,
      buysAmount: "50.00",
      buysProductIds: ["gid://shopify/Product/10"],
      getsProductIds: ["gid://shopify/Product/20"],
      getsValueType: "percentage",
      getsValue: "50",
      usesPerOrderLimit: null,
    },
    { isCreate: true },
  );
  assert.deepEqual(input.customerBuys.value, { amount: "50.00" });
  assert.equal(input.customerGets.value.discountOnQuantity.effect.percentage, 0.5);
  assert.equal(input.usesPerOrderLimit, undefined);
}

/* Fixed amount off each Get item */
{
  const input = buildAutomaticBxgyInput(
    {
      ...base,
      getsValueType: "amount",
      getsValue: "5.00",
      getsProductIds: ["gid://shopify/Product/99"],
    },
    { isCreate: true },
  );
  assert.deepEqual(input.customerGets.value.discountOnQuantity.effect, {
    amount: "5.00",
  });
}

/* Update diffs + clear usesPerOrderLimit + scope switch */
{
  const input = buildAutomaticBxgyInput(
    {
      ...base,
      buysScope: "collections",
      buysProductIds: [],
      buysCollectionIds: ["gid://shopify/Collection/5"],
      usesPerOrderLimit: null,
    },
    {
      isCreate: false,
      previousBuys: {
        scope: "products",
        productIds: ["gid://shopify/Product/1"],
        collectionIds: [],
      },
      previousGets: {
        scope: "products",
        productIds: ["gid://shopify/Product/1"],
        collectionIds: [],
      },
    },
  );
  assert.equal(input.usesPerOrderLimit, null);
  assert.deepEqual(input.customerBuys.items.products.productsToRemove, [
    "gid://shopify/Product/1",
  ]);
  assert.deepEqual(input.customerBuys.items.collections.add, [
    "gid://shopify/Collection/5",
  ]);
}

console.log("OK: BOGO BXGY input mapping assertions passed");
