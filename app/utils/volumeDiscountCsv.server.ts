import { parseVolumeDiscountForm } from "./volumeDiscountForm.server";
import {
  buildTiersJsonFromEasyColumns,
  parseJsonStringArrayFromEasyList,
} from "./csvTiersEasy.server";
import { compactCsvCellToTiersJson } from "./csvTierCompact.server";
import { buildOffersCsvHeaders } from "./offersCsvColumns";

/**
 * Flat Excel columns (tier1_buyFrom …). Legacy compact `tiers` cell still imports.
 */
export const VOLUME_DISCOUNT_CSV_HEADERS: readonly string[] =
  buildOffersCsvHeaders();

export type VolumeDiscountCsvHeader = string;

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

/** RFC 4180-style: quote if needed, escape internal quotes as "". */
export function escapeCsvField(value: string): string {
  const needsQuotes =
    /[",\r\n]/.test(value) || value.includes('"') || value.startsWith(" ");
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Parses CSV including newlines inside quoted fields.
 */
export function parseCsv(text: string): string[][] {
  const raw = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < raw.length) {
    const c = raw[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      if (raw[i] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      continue;
    }
    if (c === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  row.push(cell);
  const lastNonEmpty =
    row.length > 1 || (row[0] !== undefined && row[0].trim() !== "");
  if (lastNonEmpty) {
    rows.push(row);
  }
  return rows;
}

function normalizeCsvHeaderKey(raw: string): string {
  return raw
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase();
}

/**
 * Rows from `csvRowsToRecords` use lowercased header keys (`campaignname`).
 * Always read fields with this helper so export → re-import works.
 */
export function csvRecordGet(
  rec: Record<string, string>,
  key: string,
): string {
  return rec[key.toLowerCase()] ?? "";
}

export function csvRowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  /** Lowercase keys so Excel headers like `Status` match `status` (export uses lowercase). */
  const headers = rows[0]!.map((h) => normalizeCsvHeaderKey(h));
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (cells.length === 1 && (cells[0] ?? "").trim() === "") continue;
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c]!;
      if (!key) continue;
      rec[key] = cells[c] ?? "";
    }
    /** Guide / comment rows from the Excel template (campaignName starts with #). */
    const name = (rec.campaignname ?? "").trim();
    if (name.startsWith("#")) continue;
    out.push(rec);
  }
  return out;
}

function jsonCell(raw: string, fallback: string): string {
  const t = raw.trim();
  if (!t) return fallback;
  try {
    JSON.parse(t);
    return t;
  } catch {
    return fallback;
  }
}

/** If `raw` is valid JSON array (including `[]`), return trimmed source for FormData. */
function parseJsonArrayFieldRaw(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const p = JSON.parse(t) as unknown;
    if (Array.isArray(p)) {
      return t;
    }
  } catch {
    return null;
  }
  return null;
}

const LEGACY_LIST_KEYS = {
  customerTags: "customerTagsList",
  productIds: "productIdsList",
  collectionIds: "collectionIdsList",
} as const;

function resolveStringArrayFromCell(
  rec: Record<string, string>,
  primary: keyof typeof LEGACY_LIST_KEYS,
): string {
  let raw = csvRecordGet(rec, primary).trim();
  if (!raw) {
    raw = csvRecordGet(rec, LEGACY_LIST_KEYS[primary]).trim();
  }
  const fromJson = parseJsonArrayFieldRaw(raw);
  if (fromJson !== null) {
    return fromJson;
  }
  return (
    parseJsonStringArrayFromEasyList(raw) ?? jsonCell(raw, "[]")
  );
}

function resolveTiersJsonForCsvImport(rec: Record<string, string>): string {
  const raw = csvRecordGet(rec, "tiers");
  const t = raw.trim();
  if (t) {
    try {
      const p = JSON.parse(t) as unknown;
      if (Array.isArray(p) && p.length > 0) {
        return t;
      }
    } catch {
      /* try compact text */
    }
    const compact = compactCsvCellToTiersJson(t);
    if (compact !== null) {
      return compact;
    }
  }
  const easy = buildTiersJsonFromEasyColumns(rec);
  if (easy !== null) {
    return easy;
  }
  return jsonCell(raw, "[]");
}

function resolveWidgetDisplayForCsvImport(rec: Record<string, string>): string {
  const raw = csvRecordGet(rec, "widgetDisplay").trim();
  if (raw) {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p !== null && typeof p === "object" && !Array.isArray(p)) {
        return raw;
      }
    } catch {
      /* fall through */
    }
  }
  return jsonCell(csvRecordGet(rec, "widgetDisplay"), "{}");
}

/**
 * Builds the same fields `parseVolumeDiscountForm` reads from a CSV row.
 */
export function csvRecordToFormData(rec: Record<string, string>): FormData {
  const form = new FormData();
  form.set("campaignName", csvRecordGet(rec, "campaignName").trim());
  form.set("displayName", csvRecordGet(rec, "displayName").trim());

  const statusRaw = String(
    csvRecordGet(rec, "status") || csvRecordGet(rec, "campaignStatus") || "draft",
  )
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase();
  const campaignStatus =
    statusRaw === "active" || statusRaw === "scheduled"
      ? "active"
      : "draft";
  form.set("campaignStatus", campaignStatus);

  form.set("productScope", csvRecordGet(rec, "productScope").trim());
  form.set("quantityCondition", csvRecordGet(rec, "quantityCondition").trim());
  form.set("customerType", csvRecordGet(rec, "customerType").trim());

  form.set("customerTags", resolveStringArrayFromCell(rec, "customerTags"));
  form.set("productIds", resolveStringArrayFromCell(rec, "productIds"));
  form.set("collectionIds", resolveStringArrayFromCell(rec, "collectionIds"));

  form.set("tiers", resolveTiersJsonForCsvImport(rec));
  form.set("widgetDisplay", resolveWidgetDisplayForCsvImport(rec));
  form.set("countdownStartsAt", csvRecordGet(rec, "countdownStartsAt").trim());
  form.set("countdownEndsAt", csvRecordGet(rec, "countdownEndsAt").trim());
  return form;
}

export function parseVolumeDiscountFormFromCsvRecord(
  rec: Record<string, string>,
) {
  return parseVolumeDiscountForm(csvRecordToFormData(rec));
}
