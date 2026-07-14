import {
  isVolumeDiscountCustomerType,
  isVolumeDiscountProductScope,
  isVolumeDiscountQuantityCondition,
  type TierPayload,
  type VolumeDiscountCustomerType,
  type VolumeDiscountProductScope,
  type VolumeDiscountQuantityCondition,
} from "../types/volumeDiscount";
import { resolveCampaignStatusFromSchedule } from "./campaignScheduleStatus";
import { parseOptionalIsoDate } from "./countdownTimes";
import { toTierPayload } from "./volumeDiscountTier";
import {
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "./widgetDisplay";

export type ParsedVolumeDiscountForm =
  | { ok: false; error: string }
  | {
      ok: true;
      data: {
        campaignName: string;
        displayName: string;
        /** Persisted on `VolumeDiscountCampaign.status`: draft | active | scheduled. */
        campaignStatus: "draft" | "active" | "scheduled";
        productScope: VolumeDiscountProductScope;
        quantityCondition: VolumeDiscountQuantityCondition;
        customerType: VolumeDiscountCustomerType;
        customerTags: string[];
        tiers: TierPayload[];
        productIds: string[];
        collectionIds: string[];
        widgetDisplay: VolumeDiscountWidgetDisplay;
        countdownStartsAt: Date | null;
        countdownEndsAt: Date | null;
      };
    };

function parseJsonArray(raw: string): string[] | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return null;
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

/**
 * Shared validation for create / update volume discount POST bodies.
 */
export function parseVolumeDiscountForm(form: FormData): ParsedVolumeDiscountForm {
  const campaignName = String(form.get("campaignName") ?? "").trim();
  const displayName = String(form.get("displayName") ?? "").trim();
  const productScopeRaw = String(form.get("productScope") ?? "");
  const quantityCondition = String(form.get("quantityCondition") ?? "");
  const customerType = String(form.get("customerType") ?? "");

  if (!campaignName) {
    return { ok: false, error: "Campaign name is required" };
  }

  if (!isVolumeDiscountProductScope(productScopeRaw)) {
    return { ok: false, error: "Invalid product scope" };
  }
  const productScope = productScopeRaw;

  if (!isVolumeDiscountQuantityCondition(quantityCondition)) {
    return { ok: false, error: "Invalid quantity condition" };
  }

  if (
    quantityCondition === "per-collection" &&
    productScope !== "collections"
  ) {
    return {
      ok: false,
      error:
        "“Total quantity of each collection” only applies when the offer targets collections.",
    };
  }

  if (!isVolumeDiscountCustomerType(customerType)) {
    return { ok: false, error: "Invalid customer type" };
  }

  let customerTagsParsed: string[] = [];
  try {
    const rawTags = JSON.parse(String(form.get("customerTags") ?? "[]"));
    if (Array.isArray(rawTags)) {
      customerTagsParsed = rawTags
        .filter((x): x is string => typeof x === "string")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  } catch {
    return { ok: false, error: "Invalid customer tags" };
  }

  if (customerType === "logged-in-tag-any" && customerTagsParsed.length === 0) {
    return {
      ok: false,
      error: "Add at least one customer tag for this customer type.",
    };
  }

  let tiersRaw: unknown;
  try {
    tiersRaw = JSON.parse(String(form.get("tiers") ?? "[]"));
  } catch {
    return { ok: false, error: "Invalid tiers data" };
  }
  if (!Array.isArray(tiersRaw) || tiersRaw.length === 0) {
    return { ok: false, error: "Add at least one tier" };
  }
  const tiers = tiersRaw
    .map(toTierPayload)
    .filter((t): t is TierPayload => t !== null);
  if (tiers.length === 0) {
    return { ok: false, error: "Invalid tier fields" };
  }

  const productIdsParsed = parseJsonArray(
    String(form.get("productIds") ?? "[]"),
  );
  if (productIdsParsed === null) {
    return { ok: false, error: "Invalid product selection" };
  }

  const collectionIdsParsed = parseJsonArray(
    String(form.get("collectionIds") ?? "[]"),
  );
  if (collectionIdsParsed === null) {
    return { ok: false, error: "Invalid collection selection" };
  }

  let widgetDisplayRaw: unknown = {};
  try {
    widgetDisplayRaw = JSON.parse(
      String(form.get("widgetDisplay") ?? "{}"),
    ) as unknown;
  } catch {
    return { ok: false, error: "Invalid display settings" };
  }
  const widgetDisplay = normalizeVolumeDiscountWidgetDisplay(widgetDisplayRaw);

  const countdownStartsRaw = String(form.get("countdownStartsAt") ?? "").trim();
  const countdownEndsRaw = String(form.get("countdownEndsAt") ?? "").trim();
  const countdownStartsAt = parseOptionalIsoDate(countdownStartsRaw);
  const countdownEndsAt = parseOptionalIsoDate(countdownEndsRaw);
  if (countdownStartsRaw && countdownStartsAt === null) {
    return { ok: false, error: "Invalid countdown start time" };
  }
  if (countdownEndsRaw && countdownEndsAt === null) {
    return { ok: false, error: "Invalid countdown end time" };
  }
  if (
    countdownStartsAt &&
    countdownEndsAt &&
    countdownStartsAt.getTime() >= countdownEndsAt.getTime()
  ) {
    return {
      ok: false,
      error: "Countdown end must be after countdown start.",
    };
  }

  const statusRaw = String(form.get("campaignStatus") ?? "active")
    .trim()
    .toLowerCase();
  const requestedStatus: "draft" | "active" =
    statusRaw === "draft" ? "draft" : "active";
  const campaignStatus = resolveCampaignStatusFromSchedule({
    requestedStatus,
    startsAt: countdownStartsAt,
    endsAt: countdownEndsAt,
  });

  if (productScope === "collections") {
    if (collectionIdsParsed.length === 0) {
      return {
        ok: false,
        error: "Select at least one collection (Browse).",
      };
    }
  } else if (
    productScope === "specific-products" ||
    productScope === "group-products" ||
    productScope === "variants"
  ) {
    if (productIdsParsed.length === 0) {
      return {
        ok: false,
        error: "Select at least one product or variant (Browse).",
      };
    }
  }

  return {
    ok: true,
    data: {
      campaignName,
      displayName,
      campaignStatus,
      productScope,
      quantityCondition,
      customerType,
      customerTags: customerTagsParsed,
      tiers,
      productIds: productIdsParsed,
      collectionIds: collectionIdsParsed,
      widgetDisplay,
      countdownStartsAt,
      countdownEndsAt,
    },
  };
}

export {
  parseShopifyDiscountIds,
  normalizeTiersFromDb,
  toTierPayload,
} from "./volumeDiscountTier";
