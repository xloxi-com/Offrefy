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
  const head = input.discount?.campaignsFrag0?.jsonValue;
  const apiMode =
    ruleSource &&
    typeof ruleSource === "object" &&
    ruleSource.mode === "api";
  const legacyRemote =
    head && typeof head === "object" && head.remote === true;
  const remote = apiMode || legacyRemote;

  if (!remote) {
    return { request: undefined };
  }

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

  /** @type {string[]} */
  const productIds = [];
  const seen = new Set();
  for (const line of input.cart?.lines ?? []) {
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
