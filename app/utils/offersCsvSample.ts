/** Sample / template CSV for import modal — same columns as export. */

import {
  buildOffersCsvHeaders,
  buildOffersCsvOptionsGuideCells,
  CSV_EASY_TIER_COUNT,
} from "./offersCsvColumns";

function escapeCsvField(value: string): string {
  const needsQuotes =
    /[",\r\n]/.test(value) || value.includes('"') || value.startsWith(" ");
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function csvLine(cells: string[]): string {
  return cells.map(escapeCsvField).join(",");
}

export const OFFERS_SAMPLE_CSV_FILENAME = "offrefy-offers-template.csv";

/**
 * UTF-8 CSV with BOM (Excel-friendly):
 * 1) headers
 * 2) # OPTIONS guide row (delete before import — or leave; importer skips `#` rows)
 * 3) one filled example row
 */
export function buildOffersSampleCsv(): string {
  const headers = buildOffersCsvHeaders();
  const guide = buildOffersCsvOptionsGuideCells();

  const sampleByHeader: Record<string, string> = {
    campaignName: "Sample offer",
    displayName: "Buy more save more",
    status: "draft",
    productScope: "specific-products",
    quantityCondition: "per-variant",
    customerType: "everyone",
    customerTags: "",
    productIds: "gid://shopify/Product/123456789",
    collectionIds: "",
    countdownStartsAt: "",
    countdownEndsAt: "",
    tier1_buyFrom: "1",
    tier1_discountMode: "per-item",
    tier1_value: "0",
    tier1_valueUnit: "%",
    tier1_multiples: "no",
    tier2_buyFrom: "2",
    tier2_discountMode: "per-item",
    tier2_value: "10",
    tier2_valueUnit: "%",
    tier2_multiples: "no",
    tier3_buyFrom: "4",
    tier3_discountMode: "per-item",
    tier3_value: "15",
    tier3_valueUnit: "%",
    tier3_multiples: "no",
  };

  for (let i = 4; i <= CSV_EASY_TIER_COUNT; i++) {
    sampleByHeader[`tier${i}_buyFrom`] = "";
    sampleByHeader[`tier${i}_discountMode`] = "";
    sampleByHeader[`tier${i}_value`] = "";
    sampleByHeader[`tier${i}_valueUnit`] = "";
    sampleByHeader[`tier${i}_multiples`] = "";
  }

  const sampleRow = headers.map((h) => sampleByHeader[h] ?? "");

  return `\uFEFF${csvLine(headers)}\r\n${csvLine(guide)}\r\n${csvLine(sampleRow)}\r\n`;
}
