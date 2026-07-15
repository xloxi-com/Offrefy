import { prisma } from "../db.server";
import {
  getMaxActiveCampaigns,
  isPricingPlanId,
  planCapabilities,
  type PlanCapabilities,
  type PricingPlanId,
} from "./pricingPlans";

/** Read shop plan from settings; default free. */
export async function resolveShopPlan(shop: string): Promise<PricingPlanId> {
  try {
    const rows = await prisma.$queryRaw<Array<{ plan: string | null }>>`
      SELECT "plan"
      FROM "VolumeDiscountSettings"
      WHERE "shop" = ${shop}
      LIMIT 1
    `;
    const raw = rows[0]?.plan;
    if (isPricingPlanId(raw)) return raw;
  } catch {
    // Column may not exist yet before migrate — treat as free.
  }
  return "free";
}

export async function resolveShopPlanContext(shop: string): Promise<{
  plan: PricingPlanId;
  capabilities: PlanCapabilities;
}> {
  const plan = await resolveShopPlan(shop);
  return { plan, capabilities: planCapabilities(plan) };
}

export type PlanDowngradeEnforceResult = {
  keptActiveIds: string[];
  draftedIds: string[];
};

/**
 * After a plan change, keep at most `maxActiveCampaigns` actives (newest first).
 * Excess active campaigns become draft. Premium (unlimited) is a no-op.
 */
export async function enforcePlanActiveCampaignCap(
  shop: string,
  plan: PricingPlanId,
): Promise<PlanDowngradeEnforceResult> {
  const max = getMaxActiveCampaigns(plan);
  if (max == null) {
    return { keptActiveIds: [], draftedIds: [] };
  }

  const actives = await prisma.volumeDiscountCampaign.findMany({
    where: { shop, status: "active" },
    select: { id: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (actives.length <= max) {
    return {
      keptActiveIds: actives.map((r) => r.id),
      draftedIds: [],
    };
  }

  const kept = actives.slice(0, max);
  const excess = actives.slice(max);
  const draftedIds = excess.map((r) => r.id);

  await prisma.volumeDiscountCampaign.updateMany({
    where: { shop, id: { in: draftedIds } },
    data: { status: "draft" },
  });

  return {
    keptActiveIds: kept.map((r) => r.id),
    draftedIds,
  };
}

/** Persist merchant plan after Shopify Billing approval (or Free downgrade). */
export async function setShopPlan(
  shop: string,
  plan: PricingPlanId,
): Promise<PlanDowngradeEnforceResult> {
  await prisma.$executeRaw`
    INSERT INTO "VolumeDiscountSettings" (
      "shop",
      "syncInterval",
      "translationsString",
      "plan",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${shop},
      'disabled',
      '{}',
      ${plan},
      NOW(),
      NOW()
    )
    ON CONFLICT ("shop") DO UPDATE
    SET
      "plan" = ${plan},
      "updatedAt" = NOW()
  `;

  return enforcePlanActiveCampaignCap(shop, plan);
}

export async function countActiveCampaigns(shop: string): Promise<number> {
  return prisma.volumeDiscountCampaign.count({
    where: { shop, status: "active" },
  });
}

export async function countAllCampaigns(shop: string): Promise<number> {
  return prisma.volumeDiscountCampaign.count({
    where: { shop },
  });
}
