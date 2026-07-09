import type { TierPayload } from "../types/volumeDiscount";

/** Coerce DB/API `value` for forms (number JSON, blank → show 0 in admin). */
export function normalizeTierValueForForm(raw: unknown): string {
  if (raw === null || raw === undefined) return "0";
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  const s = String(raw).trim();
  return s === "" ? "0" : s;
}

export function isTierPayload(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const val = o.value;
  const valueOk =
    typeof val === "string" ||
    (typeof val === "number" && Number.isFinite(val));
  const multiples = o.multiples;
  const multiplesOk =
    typeof multiples === "boolean" ||
    multiples === undefined;
  if (
    typeof o.buyFrom !== "string" ||
    typeof o.discountMode !== "string" ||
    !valueOk ||
    typeof o.valueUnit !== "string" ||
    typeof o.badge !== "string" ||
    !multiplesOk ||
    typeof o.activeByDefault !== "boolean"
  ) {
    return false;
  }
  if (o.buyLabelText !== undefined && typeof o.buyLabelText !== "string") {
    return false;
  }
  if (o.optionSubtext !== undefined && typeof o.optionSubtext !== "string") {
    return false;
  }
  return true;
}

/** Normalize tier JSON (DB or form) to `TierPayload` with defaults. */
export function toTierPayload(x: unknown): TierPayload | null {
  if (!isTierPayload(x)) return null;
  const o = x as Record<string, unknown>;
  return {
    buyFrom: o.buyFrom as string,
    discountMode: o.discountMode as string,
    value: normalizeTierValueForForm(o.value),
    valueUnit: o.valueUnit as string,
    badge: o.badge as string,
    multiples: typeof o.multiples === "boolean" ? o.multiples : false,
    activeByDefault: o.activeByDefault as boolean,
    buyLabelText:
      typeof o.buyLabelText === "string" ? o.buyLabelText : "",
    optionSubtext:
      typeof o.optionSubtext === "string" ? o.optionSubtext : "",
  };
}

export function parseShopifyDiscountIds(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is string => typeof x === "string");
}

export function normalizeTiersFromDb(raw: unknown): TierPayload[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toTierPayload).filter((t): t is TierPayload => t !== null);
}
