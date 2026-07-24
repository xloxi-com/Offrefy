/**
 * @typedef {import("../generated/api").FetchInput} FetchInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateFetchResult} CartLinesDiscountsGenerateFetchResult
 */

/**
 * @param {unknown} gid
 */
function numericTailFromGid(gid) {
  if (typeof gid !== "string") return "";
  const m = gid.match(/\/(\d+)\s*$/);
  return m ? m[1] : "";
}

const MAX_CART_DISCOUNT_PRODUCTS_STANDARD = 500;
const MAX_CART_DISCOUNT_PRODUCTS_PLUS = 500;

/**
 * @param {unknown} ruleSource
 * @returns {number}
 */
function resolveMaxCartProducts(ruleSource) {
  if (ruleSource && typeof ruleSource === "object") {
    const n = /** @type {{ maxTargets?: unknown; shopifyPlus?: unknown }} */ (
      ruleSource
    ).maxTargets;
    if (typeof n === "number" && n > 0) return n | 0;
    if (typeof n === "string" && n.trim() !== "") {
      const parsed = parseInt(n, 10);
      if (parsed > 0) return parsed;
    }
    if (
      /** @type {{ shopifyPlus?: unknown }} */ (ruleSource).shopifyPlus === true
    ) {
      return MAX_CART_DISCOUNT_PRODUCTS_PLUS;
    }
  }
  return MAX_CART_DISCOUNT_PRODUCTS_STANDARD;
}

/** @param {unknown} raw @param {number} max */
function parseLockedProductIds(raw, max) {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const part of s.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const n = numericTailFromGid(trimmed) || trimmed;
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
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

  // Gap-fill: always hit cart-rules when shopDomain is set (metafield stubs
  // like `{ t: [] }` leave products undiscounted otherwise).
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

  for (const n of lockedIds) {
    if (productIds.length >= maxProducts) break;
    if (!n || seen.has(n)) continue;
    seen.add(n);
    productIds.push(n);
  }

  for (const line of input.cart?.lines ?? []) {
    if (productIds.length >= maxProducts) break;
    const m = line.merchandise;
    if (!m?.product?.id) continue;
    const n = numericTailFromGid(m.product.id);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    productIds.push(n);
  }

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
