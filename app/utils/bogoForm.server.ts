import type {
  BogoBuysRequirement,
  BogoCampaignInput,
  BogoCampaignStatus,
  BogoGetsValueType,
  BogoItemScope,
} from "../types/bogo";
import {
  parsePositiveWholeNumber,
  parseUsesPerOrderLimit,
  validateShopifyIdList,
} from "./bogoValidation";
import { normalizeVolumeDiscountWidgetDisplay } from "./widgetDisplay";
import { defaultBogoWidgetDisplay } from "./bogoWidgetDisplay";

export { defaultBogoWidgetDisplay } from "./bogoWidgetDisplay";

function parseWidgetDisplayJson(
  raw: FormDataEntryValue | null,
  displayName: string,
): Record<string, unknown> {
  let parsed: unknown = null;
  if (raw != null && String(raw).trim()) {
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      parsed = null;
    }
  }
  return normalizeVolumeDiscountWidgetDisplay(
    parsed ?? defaultBogoWidgetDisplay(displayName),
  ) as unknown as Record<string, unknown>;
}

function parseDisplayNameTranslationsJson(
  raw: FormDataEntryValue | null,
): Record<string, Record<string, string>> {
  if (raw == null || raw === "") return {};
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, Record<string, string>> = {};
    for (const [lang, pack] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!lang || !pack || typeof pack !== "object" || Array.isArray(pack)) {
        continue;
      }
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(pack as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) fields[k] = v.trim();
      }
      if (Object.keys(fields).length) out[lang] = fields;
    }
    return out;
  } catch {
    return {};
  }
}

function parseJsonStringArray(raw: FormDataEntryValue | null): string[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
      .map((x) => x.trim());
  } catch {
    return [];
  }
}

function parseStatus(raw: string): BogoCampaignStatus {
  const s = raw.toLowerCase();
  if (s === "active" || s === "scheduled" || s === "archived" || s === "draft") {
    return s;
  }
  return "draft";
}

function parseScope(raw: string): BogoItemScope {
  return raw === "collections" ? "collections" : "products";
}

function parseBuysRequirement(raw: string): BogoBuysRequirement {
  return raw === "amount" ? "amount" : "quantity";
}

function parseGetsValueType(raw: string): BogoGetsValueType {
  if (raw === "percentage" || raw === "amount") return raw;
  return "free";
}

function parseDecimalString(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

function parseIsoDateStrict(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export type ParseBogoFormResult =
  | { ok: true; data: BogoCampaignInput }
  | { ok: false; error: string };

export function parseBogoForm(form: FormData): ParseBogoFormResult {
  const campaignName = String(form.get("campaignName") ?? "").trim();
  if (!campaignName) {
    return { ok: false, error: "Campaign name is required" };
  }

  const displayName =
    String(form.get("displayName") ?? "").trim() || campaignName;
  const status = parseStatus(String(form.get("status") ?? "draft"));
  const startsAt = parseIsoDateStrict(String(form.get("startsAt") ?? ""));
  if (!startsAt) {
    return { ok: false, error: "Start date is required" };
  }
  const endsRaw = String(form.get("endsAt") ?? "").trim();
  const endsAt = endsRaw ? parseIsoDateStrict(endsRaw) : null;
  if (endsRaw && !endsAt) {
    return { ok: false, error: "End date is invalid" };
  }
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return { ok: false, error: "End date must be after the start date" };
  }

  const buysRequirement = parseBuysRequirement(
    String(form.get("buysRequirement") ?? "quantity"),
  );
  const buysScope = parseScope(String(form.get("buysScope") ?? "products"));
  const buysProductIds = parseJsonStringArray(form.get("buysProductIds"));
  const buysCollectionIds = parseJsonStringArray(form.get("buysCollectionIds"));

  let buysQuantity: number | null = null;
  let buysAmount: string | null = null;
  if (buysRequirement === "quantity") {
    buysQuantity = parsePositiveWholeNumber(
      String(form.get("buysQuantity") ?? ""),
    );
    if (buysQuantity == null) {
      return { ok: false, error: "Customer buys quantity must be at least 1" };
    }
  } else {
    buysAmount = parseDecimalString(String(form.get("buysAmount") ?? ""));
    if (!buysAmount) {
      return { ok: false, error: "Customer buys amount must be greater than 0" };
    }
  }

  if (buysScope === "products") {
    if (buysProductIds.length === 0) {
      return { ok: false, error: "Select at least one product the customer buys" };
    }
    const bad = validateShopifyIdList(buysProductIds, "product");
    if (bad) return { ok: false, error: bad };
  } else {
    if (buysCollectionIds.length === 0) {
      return {
        ok: false,
        error: "Select at least one collection the customer buys",
      };
    }
    const bad = validateShopifyIdList(buysCollectionIds, "collection");
    if (bad) return { ok: false, error: bad };
  }

  const getsQuantity = parsePositiveWholeNumber(
    String(form.get("getsQuantity") ?? ""),
  );
  if (getsQuantity == null) {
    return { ok: false, error: "Customer gets quantity must be at least 1" };
  }
  const getsScope = parseScope(String(form.get("getsScope") ?? "products"));
  const getsProductIds = parseJsonStringArray(form.get("getsProductIds"));
  const getsCollectionIds = parseJsonStringArray(form.get("getsCollectionIds"));
  const getsValueType = parseGetsValueType(
    String(form.get("getsValueType") ?? "free"),
  );

  if (getsScope === "products") {
    if (getsProductIds.length === 0) {
      return { ok: false, error: "Select at least one product the customer gets" };
    }
    const bad = validateShopifyIdList(getsProductIds, "product");
    if (bad) return { ok: false, error: bad };
  } else {
    if (getsCollectionIds.length === 0) {
      return {
        ok: false,
        error: "Select at least one collection the customer gets",
      };
    }
    const bad = validateShopifyIdList(getsCollectionIds, "collection");
    if (bad) return { ok: false, error: bad };
  }

  let getsValue: string | null = null;
  if (getsValueType === "percentage") {
    const pct = Number.parseFloat(String(form.get("getsValue") ?? ""));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return {
        ok: false,
        error: "Get discount percentage must be between 1 and 100",
      };
    }
    getsValue = String(pct);
  } else if (getsValueType === "amount") {
    getsValue = parseDecimalString(String(form.get("getsValue") ?? ""));
    if (!getsValue) {
      return { ok: false, error: "Get amount off must be greater than 0" };
    }
  }

  const usesParsed = parseUsesPerOrderLimit(
    String(form.get("usesPerOrderLimit") ?? ""),
  );
  if (!usesParsed.ok) {
    return { ok: false, error: usesParsed.error };
  }
  const usesPerOrderLimit = usesParsed.value;

  let resolvedStatus = status;
  if (resolvedStatus === "active" && startsAt.getTime() > Date.now() + 60_000) {
    resolvedStatus = "scheduled";
  }

  const widgetDisplay = parseWidgetDisplayJson(
    form.get("widgetDisplay"),
    displayName,
  );
  const displayNameTranslations = parseDisplayNameTranslationsJson(
    form.get("displayNameTranslations"),
  );

  const combinesWithProductDiscounts =
    String(form.get("combinesWithProduct") ?? "1") === "1";
  const combinesWithOrderDiscounts =
    String(form.get("combinesWithOrder") ?? "0") === "1";
  const combinesWithShippingDiscounts =
    String(form.get("combinesWithShipping") ?? "1") === "1";

  return {
    ok: true,
    data: {
      campaignName: campaignName.slice(0, 500),
      displayName: displayName.slice(0, 500),
      status: resolvedStatus,
      startsAt,
      endsAt,
      buysRequirement,
      buysQuantity,
      buysAmount,
      buysScope,
      buysProductIds,
      buysCollectionIds,
      getsQuantity,
      getsScope,
      getsProductIds,
      getsCollectionIds,
      getsValueType,
      getsValue,
      usesPerOrderLimit,
      widgetDisplay,
      displayNameTranslations,
      combinesWithProductDiscounts,
      combinesWithOrderDiscounts,
      combinesWithShippingDiscounts,
    },
  };
}

export function jsonStringArrayFromDb(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && Boolean(x));
}
