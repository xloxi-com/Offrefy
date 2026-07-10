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

  const MAX_CART_DISCOUNT_PRODUCTS = 25;
  /** @type {string[]} */
  const productIds = [];
  const seen = new Set();
  for (const line of input.cart?.lines ?? []) {
    const m = line.merchandise;
    if (!m?.product?.id) continue;
    const n = numericTailFromGid(m.product.id);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (productIds.length < MAX_CART_DISCOUNT_PRODUCTS) {
      productIds.push(n);
    }
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
