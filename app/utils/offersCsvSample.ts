/** Sample CSV for import modal — same columns as export (`VOLUME_DISCOUNT_CSV_HEADERS`). */

const HEADERS = [
  "campaignName",
  "displayName",
  "status",
  "productScope",
  "quantityCondition",
  "customerType",
  "customerTags",
  "productIds",
  "collectionIds",
  "tiers",
  "countdownStartsAt",
  "countdownEndsAt",
] as const;

function escapeCsvField(value: string): string {
  const needsQuotes =
    /[",\r\n]/.test(value) || value.includes('"') || value.startsWith(" ");
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export const OFFERS_SAMPLE_CSV_FILENAME = "offrefy-offers-sample.csv";

/** UTF-8 CSV with BOM (Excel-friendly), one example row. */
export function buildOffersSampleCsv(): string {
  const headerLine = HEADERS.map(escapeCsvField).join(",");
  const sampleRow = [
    "Sample offer",
    "Buy more save more",
    "draft",
    "specific-products",
    "per-variant",
    "everyone",
    "",
    "gid://shopify/Product/123456789",
    "",
    "1|per-item|0|%|n;2|per-item|10|%|n;4|per-item|15|%|n",
    "",
    "",
  ]
    .map(escapeCsvField)
    .join(",");
  return `\uFEFF${headerLine}\r\n${sampleRow}\r\n`;
}
