import type { TierPayload } from "../types/volumeDiscount";
import {
  CSV_EASY_TIER_COUNT,
  offersCsvTierHeaders,
  TIER_EASY_FIELDS,
  type TierEasyField,
} from "./offersCsvColumns";
import { normalizeTierValueForForm, normalizeTiersFromDb } from "./volumeDiscountTier";

export {
  CSV_EASY_TIER_COUNT,
  TIER_EASY_FIELDS,
  type TierEasyField,
};

export function tierEasyCsvHeaders(): string[] {
  return offersCsvTierHeaders();
}

function parseYesNo(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

export function normalizeDiscountModeForCsvImport(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return "per-item";
  if (s === "per-item" || s === "peritem" || s === "per item") return "per-item";
  if (s === "per-line" || s === "perline" || s === "per line") return "per-line";
  if (
    s === "fixed" ||
    s === "fixed-amount" ||
    s === "fixedamount" ||
    s === "fixed amount"
  ) {
    return "fixed";
  }
  return "per-item";
}

export function normalizeValueUnitForCsvImport(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "%";
  if (s === "%" || s === "percent" || s === "percentage" || s === "pct") {
    return "%";
  }
  if (
    s === "amount-each" ||
    s === "amount" ||
    s === "amount off each" ||
    (s.includes("amount") && s.includes("each"))
  ) {
    return "amount-each";
  }
  if (s === "fixed-price" || s === "fixed price" || s === "fixedprice") {
    return "fixed-price";
  }
  return "%";
}

function splitEasyList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function stringifyJsonStringArrayForCsv(j: unknown): string {
  if (!Array.isArray(j)) return "";
  const parts = j.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return parts.join(", ");
}

export function parseJsonStringArrayFromEasyList(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const parts = splitEasyList(t);
  if (parts.length === 0) return null;
  return JSON.stringify(parts);
}

/**
 * Flat tier columns present (tier1_buyFrom non-empty) → build tiers JSON; else return null to use `tiers` cell.
 */
/** CSV row keys are lowercased on import — match `tier1_buyfrom` etc. */
function tierCol(
  rec: Record<string, string>,
  tierIndex: number,
  field: string,
): string {
  const key = `tier${tierIndex}_${field}`;
  return rec[key.toLowerCase()] ?? "";
}

export function buildTiersJsonFromEasyColumns(
  rec: Record<string, string>,
): string | null {
  const buy1 = tierCol(rec, 1, "buyFrom").trim();
  if (!buy1) return null;

  const tiers: TierPayload[] = [];
  for (let i = 1; i <= CSV_EASY_TIER_COUNT; i++) {
    const buyFrom = tierCol(rec, i, "buyFrom").trim();
    if (!buyFrom) break;

    const discountMode = normalizeDiscountModeForCsvImport(
      tierCol(rec, i, "discountMode"),
    );
    const valueRaw = tierCol(rec, i, "value").trim();
    const value = valueRaw === "" ? "0" : normalizeTierValueForForm(valueRaw);
    const valueUnit = normalizeValueUnitForCsvImport(
      tierCol(rec, i, "valueUnit"),
    );
    const multiples = parseYesNo(tierCol(rec, i, "multiples"));

    tiers.push({
      buyFrom,
      discountMode,
      value,
      valueUnit,
      badge: "",
      multiples,
      activeByDefault: tiers.length === 0,
      buyLabelText: "",
      optionSubtext: "",
    });
  }

  if (tiers.length === 0) return null;

  const normalized = tiers.map((t, idx) => ({
    ...t,
    activeByDefault: idx === 0,
  }));

  return JSON.stringify(normalized);
}

export function tierEasyValuesForCsvExport(
  tiersJson: unknown,
): string[] {
  const tiers = normalizeTiersFromDb(tiersJson);
  const vals: string[] = [];
  for (let i = 0; i < CSV_EASY_TIER_COUNT; i++) {
    const t = tiers[i];
    if (t) {
      vals.push(
        t.buyFrom,
        t.discountMode,
        normalizeTierValueForForm(t.value),
        t.valueUnit === "amount" ? "amount-each" : t.valueUnit,
        t.multiples ? "yes" : "no",
      );
    } else {
      vals.push("", "", "", "", "");
    }
  }
  return vals;
}
