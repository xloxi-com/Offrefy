/**
 * @typedef {import("../generated/api").FetchInput} FetchInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateFetchResult} CartLinesDiscountsGenerateFetchResult
 */

/**
 * @param {unknown} gid
 * Avoid RegExp — Javy burns Function fuel on large carts.
 */
function numericTailFromGid(gid) {
  if (typeof gid !== "string") return "";
  const i = gid.lastIndexOf("/");
  if (i < 0) return "";
  const tail = gid.slice(i + 1).trim();
  if (!tail) return "";
  for (let j = 0; j < tail.length; j++) {
    const c = tail.charCodeAt(j);
    if (c < 48 || c > 57) return "";
  }
  return tail;
}

/** Practical cart product budget (instruction limit still applies). */
const MAX_CART_DISCOUNT_PRODUCTS = 500;

/**
 * @param {unknown} ruleSource
 * @returns {number}
 */
function resolveMaxCartProducts(ruleSource) {
  if (ruleSource && typeof ruleSource === "object") {
    const n = /** @type {{ maxTargets?: unknown }} */ (ruleSource).maxTargets;
    if (typeof n === "number" && n > 0) return n | 0;
    if (typeof n === "string" && n.trim() !== "") {
      const parsed = parseInt(n, 10);
      if (parsed > 0) return parsed;
    }
  }
  return MAX_CART_DISCOUNT_PRODUCTS;
}

/** @param {unknown} raw @param {number} max */
function parseLockedProductIds(raw, max) {
  const s = String(raw ?? "");
  if (!s) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  let start = 0;
  for (let i = 0; i <= s.length; i++) {
    if (i < s.length && s.charCodeAt(i) !== 44) continue;
    const part = s.slice(start, i).trim();
    start = i + 1;
    if (!part) continue;
    const n = numericTailFromGid(part) || part;
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** @param {unknown} mf */
function hasUsableTiers(mf) {
  return !!(mf && typeof mf === "object" && Array.isArray(mf.t) && mf.t.length);
}

/**
 * @param {FetchInput} input
 * @returns {CartLinesDiscountsGenerateFetchResult}
 */
export function cartLinesDiscountsGenerateFetch(input) {
  const ruleSource = input.discount?.ruleSource?.jsonValue;
  if (!ruleSource || typeof ruleSource !== "object") {
    return { request: undefined };
  }

  const shopDomain =
    typeof ruleSource.shopDomain === "string"
      ? String(ruleSource.shopDomain).trim()
      : "";
  const apiPath =
    typeof ruleSource.apiPath === "string"
      ? String(ruleSource.apiPath).trim()
      : "/apps/volume-discount/cart-rules";

  if (!shopDomain) {
    return { request: undefined };
  }

  const maxProducts = resolveMaxCartProducts(ruleSource);
  const lockedIds = parseLockedProductIds(
    input.cart?.vdLockedProductsAttr?.value,
    maxProducts,
  );
  /** @type {string[]} */
  const productIds = [];
  const seen = new Set();
  /** Products that already have tiers — never request them. */
  const covered = new Set();

  for (const line of input.cart?.lines ?? []) {
    const product = line.merchandise?.product;
    if (!product?.id) continue;
    const n = numericTailFromGid(product.id);
    if (!n) continue;
    if (hasUsableTiers(product.tiersMetafield?.jsonValue)) {
      covered.add(n);
    }
  }

  for (const n of lockedIds) {
    if (productIds.length >= maxProducts) break;
    if (!n || seen.has(n) || covered.has(n)) continue;
    seen.add(n);
    productIds.push(n);
  }

  for (const line of input.cart?.lines ?? []) {
    if (productIds.length >= maxProducts) break;
    const product = line.merchandise?.product;
    if (!product?.id) continue;
    const n = numericTailFromGid(product.id);
    if (!n || seen.has(n) || covered.has(n)) continue;
    seen.add(n);
    productIds.push(n);
  }

  // All cart products already have metafield tiers — no network needed.
  if (!productIds.length) {
    return { request: undefined };
  }

  const url = `https://${shopDomain}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;

  return {
    request: {
      method: "POST",
      url,
      headers: [{ name: "Accept", value: "application/json" }],
      jsonBody: { product_ids: productIds },
      policy: { readTimeoutMs: 2000 },
    },
  };
}
