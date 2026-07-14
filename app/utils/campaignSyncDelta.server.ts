import type { Prisma } from "@prisma/client";

type JsonValue = Prisma.JsonValue;

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function jsonArraysEqual(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

export type CampaignSyncSnapshot = {
  status: string;
  campaignName: string;
  displayName: string | null;
  productScope: string;
  quantityCondition: string;
  customerType: string;
  customerTags: unknown;
  productIds: unknown;
  collectionIds: unknown;
  tiers: unknown;
  widgetDisplay: unknown;
  countdownStartsAt: Date | null;
  countdownEndsAt: Date | null;
};

export type ParsedCampaignForm = {
  campaignStatus: string;
  campaignName: string;
  displayName: string;
  productScope: string;
  quantityCondition: string;
  customerType: string;
  customerTags: string[];
  productIds: string[];
  collectionIds: string[];
  tiers: unknown;
  widgetDisplay: JsonValue;
  countdownStartsAt: Date | null;
  countdownEndsAt: Date | null;
};

export function normCampaignStatus(status: string): string {
  return String(status).toLowerCase();
}

/** Discount Function + cart labels — requires full `syncVolumeDiscountShop`. */
export function discountFunctionFieldsChanged(
  before: CampaignSyncSnapshot,
  after: ParsedCampaignForm,
): boolean {
  if (before.campaignName !== after.campaignName) return true;
  if ((before.displayName ?? "") !== (after.displayName || "")) return true;
  if (before.productScope !== after.productScope) return true;
  if (before.quantityCondition !== after.quantityCondition) return true;
  if (before.customerType !== after.customerType) return true;
  if (!jsonArraysEqual(before.customerTags, after.customerTags)) return true;
  if (!jsonArraysEqual(before.productIds, after.productIds)) return true;
  if (!jsonArraysEqual(before.collectionIds, after.collectionIds)) return true;
  if (!jsonArraysEqual(before.tiers, after.tiers)) return true;
  return false;
}

/** Widget / countdown only — lightweight storefront cache refresh. */
export function storefrontPresentationChanged(
  before: CampaignSyncSnapshot,
  after: ParsedCampaignForm,
): boolean {
  if (!jsonArraysEqual(before.widgetDisplay, after.widgetDisplay)) return true;
  const bStart = before.countdownStartsAt?.toISOString() ?? null;
  const aStart = after.countdownStartsAt?.toISOString() ?? null;
  if (bStart !== aStart) return true;
  const bEnd = before.countdownEndsAt?.toISOString() ?? null;
  const aEnd = after.countdownEndsAt?.toISOString() ?? null;
  if (bEnd !== aEnd) return true;
  return false;
}

export type SaveSyncPlan =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "storefront_only" };

/**
 * Decide how much Shopify work is needed after a campaign save.
 * Avoids full sync (collection GraphQL + discount update) when only widget styling changed.
 */
export function planCampaignSaveSync(
  before: CampaignSyncSnapshot,
  after: ParsedCampaignForm,
): SaveSyncPlan {
  const wasActive = normCampaignStatus(before.status) === "active";
  const nowActive = normCampaignStatus(after.campaignStatus) === "active";
  const statusChanged =
    normCampaignStatus(before.status) !==
    normCampaignStatus(after.campaignStatus);

  /* Active membership flip (incl. Active ↔ Scheduled/Draft) → Function sync. */
  if (wasActive !== nowActive) {
    return { kind: "full" };
  }

  if (wasActive && nowActive && discountFunctionFieldsChanged(before, after)) {
    return { kind: "full" };
  }

  if (wasActive && nowActive && storefrontPresentationChanged(before, after)) {
    return { kind: "storefront_only" };
  }

  /*
   * Scheduled / Draft: still refresh storefront when schedule times or status change
   * so countdown + listing stay consistent after save.
   */
  if (!wasActive && !nowActive) {
    if (storefrontPresentationChanged(before, after) || statusChanged) {
      return { kind: "storefront_only" };
    }
    return { kind: "none" };
  }

  if (discountFunctionFieldsChanged(before, after)) {
    return { kind: "full" };
  }

  if (storefrontPresentationChanged(before, after) || statusChanged) {
    return { kind: "storefront_only" };
  }

  return { kind: "none" };
}
