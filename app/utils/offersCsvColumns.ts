/**
 * Shared CSV column layout for Offers export / import / sample template.
 * Flat tier columns (tier1_buyFrom …) so Excel editing stays simple.
 */

export const CSV_EASY_TIER_COUNT = 10;

export const TIER_EASY_FIELDS = [
  "buyFrom",
  "discountMode",
  "value",
  "valueUnit",
  "multiples",
] as const;

export type TierEasyField = (typeof TIER_EASY_FIELDS)[number];

/** Core campaign fields (before tier1_… columns). */
export const OFFERS_CSV_BASE_HEADERS: readonly string[] = [
  "campaignName",
  "displayName",
  "status",
  "productScope",
  "quantityCondition",
  "customerType",
  "customerTags",
  "productIds",
  "collectionIds",
  "countdownStartsAt",
  "countdownEndsAt",
];

export function offersCsvTierHeaders(): string[] {
  const h: string[] = [];
  for (let i = 1; i <= CSV_EASY_TIER_COUNT; i++) {
    for (const f of TIER_EASY_FIELDS) {
      h.push(`tier${i}_${f}`);
    }
  }
  return h;
}

/** Full header row used by export, import sample, and docs. */
export function buildOffersCsvHeaders(): string[] {
  return [...OFFERS_CSV_BASE_HEADERS, ...offersCsvTierHeaders()];
}

/** Allowed cell values (shown in sample + import UI). */
export const OFFERS_CSV_FIELD_OPTIONS = {
  status: ["draft", "active"] as const,
  productScope: [
    "all",
    "specific-products",
    "variants",
    "collections",
    "group-products",
  ] as const,
  quantityCondition: [
    "total-all",
    "per-collection",
    "per-product",
    "per-variant",
  ] as const,
  customerType: ["everyone", "logged-in", "logged-in-tag-any"] as const,
  discountMode: ["per-item", "per-line", "fixed"] as const,
  valueUnit: ["%", "amount-each", "fixed-price"] as const,
  multiples: ["yes", "no"] as const,
} as const;

export function joinCsvOptions(values: readonly string[]): string {
  return values.join(" | ");
}

/**
 * Guide row (import skips campaignName starting with `#`).
 * Puts every allowed value next to the matching column.
 */
export function buildOffersCsvOptionsGuideCells(): string[] {
  const headers = buildOffersCsvHeaders();
  const byHeader: Record<string, string> = {
    campaignName: "# OPTIONS (delete this row before import)",
    displayName: "Storefront title (optional)",
    status: joinCsvOptions(OFFERS_CSV_FIELD_OPTIONS.status),
    productScope: joinCsvOptions(OFFERS_CSV_FIELD_OPTIONS.productScope),
    quantityCondition: joinCsvOptions(
      OFFERS_CSV_FIELD_OPTIONS.quantityCondition,
    ),
    customerType: joinCsvOptions(OFFERS_CSV_FIELD_OPTIONS.customerType),
    customerTags: "Comma-separated tags (if logged-in-tag-any)",
    productIds: "Comma-separated Product GIDs",
    collectionIds: "Comma-separated Collection GIDs",
    countdownStartsAt: "ISO date e.g. 2026-07-14T10:00:00.000Z (optional)",
    countdownEndsAt: "ISO date e.g. 2026-08-01T10:00:00.000Z (optional)",
  };
  for (let i = 1; i <= CSV_EASY_TIER_COUNT; i++) {
    byHeader[`tier${i}_buyFrom`] =
      i === 1 ? "Min qty (required for each tier you use)" : "Min qty or leave blank";
    byHeader[`tier${i}_discountMode`] = joinCsvOptions(
      OFFERS_CSV_FIELD_OPTIONS.discountMode,
    );
    byHeader[`tier${i}_value`] = "Number e.g. 10";
    byHeader[`tier${i}_valueUnit`] = joinCsvOptions(
      OFFERS_CSV_FIELD_OPTIONS.valueUnit,
    );
    byHeader[`tier${i}_multiples`] = joinCsvOptions(
      OFFERS_CSV_FIELD_OPTIONS.multiples,
    );
  }
  return headers.map((h) => byHeader[h] ?? "");
}
