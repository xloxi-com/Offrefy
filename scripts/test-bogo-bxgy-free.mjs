/**
 * Isolated BOGO Buy X Get Y FREE tests (mapping, validation, Shopify-native math).
 * Run: node scripts/test-bogo-bxgy-free.mjs
 *
 * Does not touch volume-discount Function / Quantity Breaks.
 */
import assert from "node:assert/strict";

/* ─── mirrors of app/utils/bogoBxgyInput.ts + bogoValidation.ts ─── */

const PRODUCT_GID_RE = /^gid:\/\/shopify\/Product\/\d+$/;
const COLLECTION_GID_RE = /^gid:\/\/shopify\/Collection\/\d+$/;

function isShopifyProductGid(id) {
  return PRODUCT_GID_RE.test(String(id).trim());
}
function isShopifyCollectionGid(id) {
  return COLLECTION_GID_RE.test(String(id).trim());
}
function parsePositiveWholeNumber(raw) {
  const t = String(raw ?? "").trim();
  if (!t || !/^\d+$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}
function parseUsesPerOrderLimit(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return { ok: true, value: null };
  const n = parsePositiveWholeNumber(t);
  if (n == null) {
    return {
      ok: false,
      error:
        "Maximum uses per order must be a positive whole number, or left blank for unlimited",
    };
  }
  return { ok: true, value: n };
}
function validateShopifyIdList(ids, kind) {
  const check = kind === "product" ? isShopifyProductGid : isShopifyCollectionGid;
  for (const id of ids) {
    if (!check(id)) return `Invalid Shopify ${kind} ID: ${id}`;
  }
  return null;
}

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

function expectedSameProductFreeUnits({
  cartQty,
  buyQty,
  getQty,
  usesPerOrderLimit,
}) {
  const buy = Math.max(1, buyQty);
  const get = Math.max(1, getQty);
  const group = buy + get;
  if (cartQty < group) return 0;
  let apps = Math.floor(cartQty / group);
  if (usesPerOrderLimit != null && usesPerOrderLimit > 0) {
    apps = Math.min(apps, usesPerOrderLimit);
  }
  return apps * get;
}

function expectedCrossProductFreeUnits({
  buyEligibleQty,
  getEligibleQty,
  buyQty,
  getQty,
  usesPerOrderLimit,
}) {
  const buy = Math.max(1, buyQty);
  const get = Math.max(1, getQty);
  if (buyEligibleQty < buy || getEligibleQty < get) return 0;
  let apps = Math.floor(buyEligibleQty / buy);
  apps = Math.min(apps, Math.floor(getEligibleQty / get));
  if (usesPerOrderLimit != null && usesPerOrderLimit > 0) {
    apps = Math.min(apps, usesPerOrderLimit);
  }
  return apps * get;
}

function paidAndFreeSameProduct(cartQty, buyQty, getQty, usesPerOrderLimit) {
  const free = expectedSameProductFreeUnits({
    cartQty,
    buyQty,
    getQty,
    usesPerOrderLimit,
  });
  return { paid: cartQty - free, free };
}

const PRODUCT_A = "gid://shopify/Product/111";
const PRODUCT_B = "gid://shopify/Product/222";
const PRODUCT_C = "gid://shopify/Product/333";
const COLLECTION_1 = "gid://shopify/Collection/10";

const freeBase = {
  campaignName: "Free BOGO",
  displayName: "Buy X Get Y Free",
  status: "active",
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: null,
  buysRequirement: "quantity",
  buysQuantity: 1,
  buysAmount: null,
  buysScope: "products",
  buysProductIds: [PRODUCT_A],
  buysCollectionIds: [],
  getsQuantity: 1,
  getsScope: "products",
  getsProductIds: [PRODUCT_A],
  getsCollectionIds: [],
  getsValueType: "free",
  getsValue: null,
  usesPerOrderLimit: null,
};

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

console.log("\n=== FREE: GraphQL payload (Buy 1 Get 1 same product) ===");
{
  const input = buildAutomaticBxgyInput(
    { ...freeBase, buysQuantity: 1, getsQuantity: 1 },
    { isCreate: true },
  );
  assert.equal(input.customerBuys.value.quantity, "1");
  assert.deepEqual(input.customerGets.value.discountOnQuantity, {
    quantity: "1",
    effect: { percentage: 1 },
  });
  assert.equal(input.usesPerOrderLimit, undefined, "unlimited omits usesPerOrderLimit on create");
  assert.deepEqual(input.customerBuys.items.products.productsToAdd, [PRODUCT_A]);
  assert.deepEqual(input.customerGets.items.products.productsToAdd, [PRODUCT_A]);
  assert.equal(input.endsAt, null);
  ok("Buy 1 Get 1 Free same-product payload");
}

console.log("\n=== FREE: GraphQL payload (Buy 2 Get 1) ===");
{
  const input = buildAutomaticBxgyInput(
    { ...freeBase, buysQuantity: 2, getsQuantity: 1 },
    { isCreate: true },
  );
  assert.equal(input.customerBuys.value.quantity, "2");
  assert.equal(input.customerGets.value.discountOnQuantity.quantity, "1");
  assert.equal(input.customerGets.value.discountOnQuantity.effect.percentage, 1);
  ok("Buy 2 Get 1 Free payload");
}

console.log("\n=== FREE: GraphQL payload (Buy 3 Get 2) ===");
{
  const input = buildAutomaticBxgyInput(
    { ...freeBase, buysQuantity: 3, getsQuantity: 2 },
    { isCreate: true },
  );
  assert.equal(input.customerBuys.value.quantity, "3");
  assert.equal(input.customerGets.value.discountOnQuantity.quantity, "2");
  assert.equal(input.customerGets.value.discountOnQuantity.effect.percentage, 1);
  ok("Buy 3 Get 2 Free payload");
}

console.log("\n=== FREE: Cross-product A→B ===");
{
  const input = buildAutomaticBxgyInput(
    {
      ...freeBase,
      buysProductIds: [PRODUCT_A],
      getsProductIds: [PRODUCT_B],
    },
    { isCreate: true },
  );
  assert.deepEqual(input.customerBuys.items.products.productsToAdd, [PRODUCT_A]);
  assert.deepEqual(input.customerGets.items.products.productsToAdd, [PRODUCT_B]);
  assert.equal(input.customerGets.value.discountOnQuantity.effect.percentage, 1);
  ok("Buy A Get B Free");
}

console.log("\n=== FREE: Multiple Buy + Get products ===");
{
  const input = buildAutomaticBxgyInput(
    {
      ...freeBase,
      buysProductIds: [PRODUCT_A, PRODUCT_C],
      getsProductIds: [PRODUCT_B, PRODUCT_C],
    },
    { isCreate: true },
  );
  assert.deepEqual(input.customerBuys.items.products.productsToAdd, [
    PRODUCT_A,
    PRODUCT_C,
  ]);
  assert.deepEqual(input.customerGets.items.products.productsToAdd, [
    PRODUCT_B,
    PRODUCT_C,
  ]);
  ok("Multiple eligible Buy/Get products");
}

console.log("\n=== FREE: Collection scope ===");
{
  const input = buildAutomaticBxgyInput(
    {
      ...freeBase,
      buysScope: "collections",
      buysProductIds: [],
      buysCollectionIds: [COLLECTION_1],
      getsScope: "collections",
      getsProductIds: [],
      getsCollectionIds: [COLLECTION_1],
    },
    { isCreate: true },
  );
  assert.deepEqual(input.customerBuys.items.collections.add, [COLLECTION_1]);
  assert.deepEqual(input.customerGets.items.collections.add, [COLLECTION_1]);
  ok("Collection Buy/Get");
}

console.log("\n=== FREE: usesPerOrderLimit ===");
{
  const limited = buildAutomaticBxgyInput(
    { ...freeBase, usesPerOrderLimit: 1 },
    { isCreate: true },
  );
  assert.equal(limited.usesPerOrderLimit, "1");
  const clear = buildAutomaticBxgyInput(
    { ...freeBase, usesPerOrderLimit: null },
    { isCreate: false, previousBuys: null, previousGets: null },
  );
  assert.equal(clear.usesPerOrderLimit, null);
  ok("Limit string on create; null clears on update");
}

console.log("\n=== FREE: Edit removes deselected products ===");
{
  const input = buildAutomaticBxgyInput(
    {
      ...freeBase,
      buysProductIds: [PRODUCT_B],
      getsProductIds: [PRODUCT_B],
    },
    {
      isCreate: false,
      previousBuys: {
        scope: "products",
        productIds: [PRODUCT_A, PRODUCT_B],
        collectionIds: [],
      },
      previousGets: {
        scope: "products",
        productIds: [PRODUCT_A],
        collectionIds: [],
      },
    },
  );
  assert.deepEqual(input.customerBuys.items.products.productsToRemove, [
    PRODUCT_A,
  ]);
  assert.deepEqual(input.customerGets.items.products.productsToRemove, [
    PRODUCT_A,
  ]);
  assert.deepEqual(input.customerGets.items.products.productsToAdd, [
    PRODUCT_B,
  ]);
  ok("Product removal diffs on update");
}

console.log("\n=== Native math: Buy 1 Get 1 Free unlimited (Example A) ===");
{
  const cases = [
    [1, 1, 0],
    [2, 1, 1],
    [3, 2, 1],
    [4, 2, 2],
    [5, 3, 2],
    [6, 3, 3],
  ];
  for (const [cart, paid, free] of cases) {
    const r = paidAndFreeSameProduct(cart, 1, 1, null);
    assert.deepEqual(r, { paid, free }, `qty ${cart}`);
  }
  ok("Example A table");
}

console.log("\n=== Native math: Buy 2 Get 1 Free unlimited (Example B) ===");
{
  const cases = [
    [1, 1, 0],
    [2, 2, 0],
    [3, 2, 1],
    [4, 3, 1],
    [5, 4, 1],
    [6, 4, 2],
  ];
  for (const [cart, paid, free] of cases) {
    const r = paidAndFreeSameProduct(cart, 2, 1, null);
    assert.deepEqual(r, { paid, free }, `qty ${cart}`);
  }
  ok("Example B table");
}

console.log("\n=== Native math: Buy 3 Get 2 Free ===");
{
  assert.equal(
    expectedSameProductFreeUnits({
      cartQty: 4,
      buyQty: 3,
      getQty: 2,
      usesPerOrderLimit: null,
    }),
    0,
  );
  assert.equal(
    expectedSameProductFreeUnits({
      cartQty: 5,
      buyQty: 3,
      getQty: 2,
      usesPerOrderLimit: null,
    }),
    2,
  );
  assert.equal(
    expectedSameProductFreeUnits({
      cartQty: 10,
      buyQty: 3,
      getQty: 2,
      usesPerOrderLimit: null,
    }),
    4,
  );
  ok("Buy 3 Get 2 Free");
}

console.log("\n=== Native math: max 1 use per order ===");
{
  assert.equal(
    expectedSameProductFreeUnits({
      cartQty: 2,
      buyQty: 1,
      getQty: 1,
      usesPerOrderLimit: 1,
    }),
    1,
  );
  assert.equal(
    expectedSameProductFreeUnits({
      cartQty: 4,
      buyQty: 1,
      getQty: 1,
      usesPerOrderLimit: 1,
    }),
    1,
  );
  assert.equal(
    expectedSameProductFreeUnits({
      cartQty: 6,
      buyQty: 1,
      getQty: 1,
      usesPerOrderLimit: 1,
    }),
    1,
  );
  ok("Buy 1 Get 1 Free — max 1 use");
}

console.log("\n=== Native math: cross-product A/B (Example C) ===");
{
  assert.equal(
    expectedCrossProductFreeUnits({
      buyEligibleQty: 1,
      getEligibleQty: 1,
      buyQty: 1,
      getQty: 1,
      usesPerOrderLimit: null,
    }),
    1,
  );
  assert.equal(
    expectedCrossProductFreeUnits({
      buyEligibleQty: 1,
      getEligibleQty: 0,
      buyQty: 1,
      getQty: 1,
      usesPerOrderLimit: null,
    }),
    0,
  );
  assert.equal(
    expectedCrossProductFreeUnits({
      buyEligibleQty: 0,
      getEligibleQty: 1,
      buyQty: 1,
      getQty: 1,
      usesPerOrderLimit: null,
    }),
    0,
  );
  assert.equal(
    expectedCrossProductFreeUnits({
      buyEligibleQty: 2,
      getEligibleQty: 2,
      buyQty: 1,
      getQty: 1,
      usesPerOrderLimit: null,
    }),
    2,
  );
  /* Unrelated product C never contributes */
  assert.equal(
    expectedCrossProductFreeUnits({
      buyEligibleQty: 0,
      getEligibleQty: 5,
      buyQty: 1,
      getQty: 1,
      usesPerOrderLimit: null,
    }),
    0,
  );
  ok("Example C + unrelated exclusion");
}

console.log("\n=== Validation: quantities / IDs / dates / uses ===");
{
  assert.equal(parsePositiveWholeNumber("1"), 1);
  assert.equal(parsePositiveWholeNumber("0"), null);
  assert.equal(parsePositiveWholeNumber("1.5"), null);
  assert.equal(parsePositiveWholeNumber(""), null);
  assert.equal(parsePositiveWholeNumber("-2"), null);
  assert.equal(parseUsesPerOrderLimit("").value, null);
  assert.equal(parseUsesPerOrderLimit("3").value, 3);
  assert.equal(parseUsesPerOrderLimit("0").ok, false);
  assert.equal(parseUsesPerOrderLimit("1.2").ok, false);
  assert.ok(isShopifyProductGid(PRODUCT_A));
  assert.equal(isShopifyProductGid("Product/1"), false);
  assert.equal(isShopifyProductGid("gid://shopify/Product/abc"), false);
  assert.ok(isShopifyCollectionGid(COLLECTION_1));
  assert.equal(
    validateShopifyIdList(["bad"], "product"),
    "Invalid Shopify product ID: bad",
  );
  assert.equal(validateShopifyIdList([PRODUCT_A], "product"), null);
  ok("Validation helpers");
}

console.log("\n=== Sync decision helpers (mocked) ===");
{
  const isMissingDiscountError = (errors) => {
    const blob = errors.join(" ").toLowerCase();
    return (
      blob.includes("not found") ||
      blob.includes("does not exist") ||
      blob.includes("invalid id") ||
      blob.includes("doesn't exist")
    );
  };
  const shouldRecreate = (updateErrors) => {
    return isMissingDiscountError(updateErrors);
  };
  assert.equal(shouldRecreate(["Title is blank"]), false);
  assert.equal(shouldRecreate(["Discount not found"]), true);
  assert.equal(shouldRecreate(["GraphQL error: does not exist"]), true);
  ok("Recreate only when remote missing");
}

console.log("\n=== Percentage free must stay 1 (not 100 or 0.01) ===");
{
  assert.deepEqual(buildBxgyGetsEffect("free", null), { percentage: 1 });
  assert.notEqual(buildBxgyGetsEffect("free", null).percentage, 100);
  assert.notEqual(buildBxgyGetsEffect("free", null).percentage, 0.01);
  ok("Free = percentage 1.0");
}

console.log(`\nOK: ${passed} BOGO Free assertion groups passed\n`);
