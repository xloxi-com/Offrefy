import { prisma } from "../db.server";

export type CampaignScheduleTransitionResult = {
  /** Shops whose Active membership changed — need Function + storefront sync. */
  shopsNeedingShopifySync: string[];
  /** Shops with status-only updates (e.g. draft → scheduled) — optional cache refresh. */
  shopsStatusOnly: string[];
  activatedIds: string[];
  deactivatedIds: string[];
  markedScheduledIds: string[];
};

/**
 * Flip campaign status from schedule window:
 * - scheduled + start time due (+ end not passed) → active
 * - active + end time due → draft
 * - draft + future start → scheduled (legacy promote)
 */
export async function applyDueCampaignScheduleTransitions(
  shopFilter?: string,
): Promise<CampaignScheduleTransitionResult> {
  const now = new Date();
  const shopWhere = shopFilter ? { shop: shopFilter } : {};

  const toActivate = await prisma.volumeDiscountCampaign.findMany({
    where: {
      ...shopWhere,
      status: "scheduled",
      countdownStartsAt: { not: null, lte: now },
      OR: [{ countdownEndsAt: null }, { countdownEndsAt: { gt: now } }],
    },
    select: { id: true, shop: true },
  });

  const toDeactivate = await prisma.volumeDiscountCampaign.findMany({
    where: {
      ...shopWhere,
      status: "active",
      countdownEndsAt: { not: null, lte: now },
    },
    select: { id: true, shop: true },
  });

  const toMarkScheduled = await prisma.volumeDiscountCampaign.findMany({
    where: {
      ...shopWhere,
      status: "draft",
      countdownStartsAt: { not: null, gt: now },
    },
    select: { id: true, shop: true },
  });

  const shopsNeedingShopifySync = new Set<string>();
  const shopsStatusOnly = new Set<string>();

  if (toActivate.length) {
    await prisma.volumeDiscountCampaign.updateMany({
      where: { id: { in: toActivate.map((r) => r.id) } },
      data: { status: "active" },
    });
    for (const r of toActivate) shopsNeedingShopifySync.add(r.shop);
  }

  if (toDeactivate.length) {
    await prisma.volumeDiscountCampaign.updateMany({
      where: { id: { in: toDeactivate.map((r) => r.id) } },
      data: { status: "draft" },
    });
    for (const r of toDeactivate) shopsNeedingShopifySync.add(r.shop);
  }

  if (toMarkScheduled.length) {
    await prisma.volumeDiscountCampaign.updateMany({
      where: { id: { in: toMarkScheduled.map((r) => r.id) } },
      data: { status: "scheduled" },
    });
    for (const r of toMarkScheduled) shopsStatusOnly.add(r.shop);
  }

  return {
    shopsNeedingShopifySync: [...shopsNeedingShopifySync],
    shopsStatusOnly: [...shopsStatusOnly],
    activatedIds: toActivate.map((r) => r.id),
    deactivatedIds: toDeactivate.map((r) => r.id),
    markedScheduledIds: toMarkScheduled.map((r) => r.id),
  };
}
