import type { TierPayload } from "../types/volumeDiscount";
import {
  normalizeDiscountModeForCsvImport,
  normalizeValueUnitForCsvImport,
} from "./csvTiersEasy.server";
import { normalizeTierValueForForm, normalizeTiersFromDb } from "./volumeDiscountTier";

/**
 * One cell, human-editable. Tiers separated by `;`, fields by `|`:
 *   buyFrom|discountMode|value|valueUnit|multiples
 * multiples: y/n (or yes/no/1/0)
 *
 * Example: 1|per-item|10|%|n;11|per-item|15|%|n
 */
export function tiersJsonToCompactCsvCell(tiersJson: unknown): string {
  const tiers = normalizeTiersFromDb(tiersJson);
  return tiers
    .map((t) => {
      const mult = t.multiples ? "y" : "n";
      const v = normalizeTierValueForForm(t.value);
      const u = t.valueUnit === "amount" ? "amount-each" : t.valueUnit;
      return `${t.buyFrom}|${t.discountMode}|${v}|${u}|${mult}`;
    })
    .join(";");
}

function parseMult(s: string): boolean {
  const x = s.trim().toLowerCase();
  return x === "y" || x === "yes" || x === "1" || x === "true";
}

/** Returns JSON string for FormData, or null if not valid compact syntax. */
export function compactCsvCellToTiersJson(cell: string): string | null {
  const t = cell.trim();
  if (!t || t.startsWith("[")) return null;
  const segments = t
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  const tiers: TierPayload[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const parts = seg.split("|").map((p) => p.trim());
    if (parts.length < 5) return null;
    const [buyFrom, dm, val, vu, multRaw] = parts;
    if (!buyFrom) return null;
    const discountMode = normalizeDiscountModeForCsvImport(dm ?? "");
    const value =
      (val ?? "").trim() === "" ? "0" : normalizeTierValueForForm(val ?? "");
    const valueUnit = normalizeValueUnitForCsvImport(vu ?? "");
    const multiples = parseMult(multRaw ?? "");
    tiers.push({
      buyFrom,
      discountMode,
      value,
      valueUnit,
      badge: "",
      multiples,
      activeByDefault: i === 0,
      buyLabelText: "",
      optionSubtext: "",
    });
  }
  return JSON.stringify(
    tiers.map((tier, idx) => ({
      ...tier,
      activeByDefault: idx === 0,
    })),
  );
}
