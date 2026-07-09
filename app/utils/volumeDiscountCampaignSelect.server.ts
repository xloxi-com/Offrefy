import type { Prisma } from "@prisma/client";

/** Prisma `select` for sync, storefront cache, and widget-config hot paths. */
export const volumeDiscountCampaignSyncSelect = {
  id: true,
  campaignName: true,
  displayName: true,
  productScope: true,
  quantityCondition: true,
  customerType: true,
  customerTags: true,
  productIds: true,
  collectionIds: true,
  tiers: true,
  widgetDisplay: true,
  status: true,
  countdownStartsAt: true,
  countdownEndsAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VolumeDiscountCampaignSelect;

export type VolumeDiscountCampaignSyncRow = Prisma.VolumeDiscountCampaignGetPayload<{
  select: typeof volumeDiscountCampaignSyncSelect;
}>;
