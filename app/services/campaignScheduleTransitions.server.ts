import { prisma } from "../db.server";
import { getMaxActiveCampaigns } from "../utils/pricingPlans";
import { resolveShopPlan } from "../utils/shopPlan.server";

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
 * - scheduled + start time due (+ end not passed) → active (respects plan active caps)
 * - scheduled + end time due → draft (missed / expired window — never leave stuck Scheduled)
 * - active + end time due → draft
 * - draft + future start → scheduled (legacy promote)
 */
export async function applyDueCampaignScheduleTransitions(
  shopFilter?: string,
): Promise<CampaignScheduleTransitionResult> {
  const now = new Date();
  const shopWhere = shopFilter ? { shop: shopFilter } : {};

  const [toActivate, toDeactivate, toExpireScheduled, toMarkScheduled] =
    await Promise.all([
      prisma.volumeDiscountCampaign.findMany({
        where: {
          ...shopWhere,
          status: "scheduled",
          countdownStartsAt: { not: null, lte: now },
          OR: [{ countdownEndsAt: null }, { countdownEndsAt: { gt: now } }],
        },
        select: { id: true, shop: true },
        orderBy: { countdownStartsAt: "asc" },
      }),
      prisma.volumeDiscountCampaign.findMany({
        where: {
          ...shopWhere,
          status: "active",
          countdownEndsAt: { not: null, lte: now },
        },
        select: { id: true, shop: true },
      }),
      prisma.volumeDiscountCampaign.findMany({
        where: {
          ...shopWhere,
          status: "scheduled",
          countdownEndsAt: { not: null, lte: now },
        },
        select: { id: true, shop: true },
      }),
      prisma.volumeDiscountCampaign.findMany({
        where: {
          ...shopWhere,
          status: "draft",
          countdownStartsAt: { not: null, gt: now },
        },
        select: { id: true, shop: true },
      }),
    ]);

  const shopsNeedingShopifySync = new Set<string>();
  const shopsStatusOnly = new Set<string>();
  const activatedIds: string[] = [];
  const deactivatedIds: string[] = [];

  if (toActivate.length) {
    const byShop = new Map<string, string[]>();
    for (const r of toActivate) {
      const list = byShop.get(r.shop) ?? [];
      list.push(r.id);
      byShop.set(r.shop, list);
    }

    for (const [shop, ids] of byShop) {
      const [plan, activeCount] = await Promise.all([
        resolveShopPlan(shop),
        prisma.volumeDiscountCampaign.count({
          where: { shop, status: "active" },
        }),
      ]);
      const max = getMaxActiveCampaigns(plan);
      const room = max == null ? ids.length : Math.max(0, max - activeCount);
      const allow = ids.slice(0, room);
      if (allow.length === 0) continue;
      await prisma.volumeDiscountCampaign.updateMany({
        where: { id: { in: allow } },
        data: { status: "active" },
      });
      activatedIds.push(...allow);
      shopsNeedingShopifySync.add(shop);
    }
  }

  const toDraft = [...toDeactivate, ...toExpireScheduled];
  if (toDraft.length) {
    const draftIds = [...new Set(toDraft.map((r) => r.id))];
    await prisma.volumeDiscountCampaign.updateMany({
      where: { id: { in: draftIds } },
      data: { status: "draft" },
    });
    deactivatedIds.push(...draftIds);
    for (const r of toDraft) shopsNeedingShopifySync.add(r.shop);
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
    shopsStatusOnly: [...shopsStatusOnly].filter(
      (s) => !shopsNeedingShopifySync.has(s),
    ),
    activatedIds,
    deactivatedIds,
    markedScheduledIds: toMarkScheduled.map((r) => r.id),
  };
}
