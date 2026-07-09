import { createHash } from "node:crypto";
import type { VolumeDiscountCampaignSyncRow } from "./volumeDiscountCampaignSelect.server";

/** Deterministic hash of active campaign rows — discount-relevant fields only. */
export function rowSyncFingerprint(
  rows: readonly VolumeDiscountCampaignSyncRow[],
): string {
  const payload = rows.map((r) => ({
    id: r.id,
    campaignName: r.campaignName,
    displayName: r.displayName,
    productScope: r.productScope,
    quantityCondition: r.quantityCondition,
    customerType: r.customerType,
    customerTags: r.customerTags,
    productIds: r.productIds,
    collectionIds: r.collectionIds,
    tiers: r.tiers,
    widgetDisplay: r.widgetDisplay,
    countdownStartsAt: r.countdownStartsAt?.toISOString() ?? null,
    countdownEndsAt: r.countdownEndsAt?.toISOString() ?? null,
  }));
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}
