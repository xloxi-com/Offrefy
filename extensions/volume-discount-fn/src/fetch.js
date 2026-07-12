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

const MAX_CART_DISCOUNT_PRODUCTS = 25;

/** @param {unknown} raw */
function parseLockedProductIds(raw) {
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
  }
  return out.slice(0, MAX_CART_DISCOUNT_PRODUCTS);
}

/**
 * @param {FetchInput} input
 * @returns {CartLinesDiscountsGenerateFetchResult}
 */
export function cartLinesDiscountsGenerateFetch(input) {
  const ruleSource = input.discount?.ruleSource?.jsonValue;

  const shopDomain =
    ruleSource &&
    typeof ruleSource === "object" &&
    typeof ruleSource.shopDomain === "string"
      ? String(ruleSource.shopDomain).trim()
      : "";
  const apiPath =
    ruleSource &&
    typeof ruleSource === "object" &&
    typeof ruleSource.apiPath === "string"
      ? String(ruleSource.apiPath).trim()
      : "/apps/volume-discount/cart-rules";

  if (!shopDomain) {
    return { request: undefined };
  }

  const lockedIds = parseLockedProductIds(
    input.cart?.vdLockedProductsAttr?.value,
  );
  /** @type {string[]} */
  const productIds = [];
  const seen = new Set();

  for (const n of lockedIds) {
    if (productIds.length >= MAX_CART_DISCOUNT_PRODUCTS) break;
    if (!n || seen.has(n)) continue;
    seen.add(n);
    productIds.push(n);
  }

  for (const line of input.cart?.lines ?? []) {
    if (productIds.length >= MAX_CART_DISCOUNT_PRODUCTS) break;
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
