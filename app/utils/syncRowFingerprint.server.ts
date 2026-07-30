import { createHash } from "node:crypto";
import type { VolumeDiscountCampaignSyncRow } from "./volumeDiscountCampaignSelect.server";
import {
  isCampaignScheduleExpired,
  isCampaignSchedulePendingStart,
} from "./campaignScheduleStatus";

export type SyncFingerprintExtras = {
  /** Cart product-discount target cap (default 500 — practical unlimited). */
  maxDiscountProducts?: number;
  /** Bump when rule_source shape changes (forces discount metafield re-sync). */
  ruleSourceVersion?: number;
};

/** pending → live (or live → ended) must change the hash so sync is not skipped. */
function scheduleWindowPhase(
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date,
): "pending" | "live" | "ended" {
  if (isCampaignScheduleExpired(endsAt, now)) return "ended";
  if (isCampaignSchedulePendingStart(startsAt, now)) return "pending";
  return "live";
}

/** Deterministic hash of active campaign rows — discount-relevant fields only. */
export function rowSyncFingerprint(
  rows: readonly VolumeDiscountCampaignSyncRow[],
  extras?: SyncFingerprintExtras,
  now: Date = new Date(),
): string {
  const payload = {
    rows: rows.map((r) => ({
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
      schedulePhase: scheduleWindowPhase(
        r.countdownStartsAt,
        r.countdownEndsAt,
        now,
      ),
    })),
    maxDiscountProducts: extras?.maxDiscountProducts ?? null,
    ruleSourceVersion: extras?.ruleSourceVersion ?? null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}
