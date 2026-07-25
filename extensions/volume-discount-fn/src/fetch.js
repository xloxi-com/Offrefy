/**
 * @typedef {import("../generated/api").FetchInput} FetchInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateFetchResult} CartLinesDiscountsGenerateFetchResult
 */

/**
 * Network fetch disabled for fuel safety.
 * cart-rules JSON.parse previously burned the ~11M instruction budget and
 * crashed the Function (all Remise discounts disappeared). Product
 * `volume_discount.tiers` metafields from sync are the sole rule source.
 *
 * @param {FetchInput} _input
 * @returns {CartLinesDiscountsGenerateFetchResult}
 */
export function cartLinesDiscountsGenerateFetch(_input) {
  return { request: undefined };
}
