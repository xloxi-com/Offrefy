import { Prisma } from "@prisma/client";
import { prisma } from "../db.server";
import { pricingPlanFromBillingName } from "./billingPlans";
import {
  getMaxActiveCampaigns,
  isPricingPlanId,
  planCapabilities,
  type PlanCapabilities,
  type PricingPlanId,
} from "./pricingPlans";

type GraphqlAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Process-lifetime memo — avoid ALTER on every Home / plan hit. */
let postInstallPricingColumnEnsured = false;

/** Ensure the column exists (safe for deploys that lag migrate). */
export async function ensurePostInstallPricingColumn(): Promise<void> {
  if (postInstallPricingColumnEnsured) return;
  try {
    await prisma.$executeRaw(
      Prisma.sql`
        ALTER TABLE "VolumeDiscountSettings"
        ADD COLUMN IF NOT EXISTS "postInstallPricingPending" BOOLEAN NOT NULL DEFAULT false
      `,
    );
    postInstallPricingColumnEnsured = true;
  } catch (error) {
    console.warn("[Offrefy] ensurePostInstallPricingColumn", error);
  }
}

/**
 * Mark Pricing redirect for the next app open (uninstall → reinstall, or explicit).
 * No-op if settings row is missing.
 */
export async function markPostInstallPricingPending(
  shop: string,
): Promise<void> {
  await ensurePostInstallPricingColumn();
  try {
    await prisma.$executeRaw`
      UPDATE "VolumeDiscountSettings"
      SET
        "postInstallPricingPending" = true,
        "updatedAt" = NOW()
      WHERE "shop" = ${shop}
    `;
  } catch (error) {
    console.warn("[Offrefy] markPostInstallPricingPending", error);
  }
}

/**
 * Atomically clear the one-shot install flag.
 * @returns true when this request should redirect to Pricing.
 */
export async function consumePostInstallPricingRedirect(
  shop: string,
): Promise<boolean> {
  await ensurePostInstallPricingColumn();
  try {
    const updated = await prisma.$executeRaw`
      UPDATE "VolumeDiscountSettings"
      SET
        "postInstallPricingPending" = false,
        "updatedAt" = NOW()
      WHERE "shop" = ${shop}
        AND "postInstallPricingPending" = true
    `;
    return Number(updated) > 0;
  } catch (error) {
    console.warn("[Offrefy] consumePostInstallPricingRedirect", error);
    return false;
  }
}

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

/**
 * On install / re-auth: default to Free unless Shopify has an active paid
 * subscription (then sync that plan). Persists Free so Pricing shows it selected.
 */
export async function ensureDefaultFreePlanOnInstall(
  shop: string,
  admin: GraphqlAdmin,
): Promise<PricingPlanId> {
  let billingChecked = false;
  try {
    const { listActiveAppSubscriptions } = await import(
      "../services/shopifyBilling.server"
    );
    const active = await listActiveAppSubscriptions(admin);
    billingChecked = true;
    const mapped = pricingPlanFromBillingName(active[0]?.name);
    if (mapped) {
      if ((await resolveShopPlan(shop)) !== mapped) {
        await setShopPlan(shop, mapped);
      }
      return mapped;
    }
  } catch (error) {
    console.warn("[Offrefy] ensureDefaultFreePlanOnInstall billing check", error);
  }

  const current = await resolveShopPlan(shop);

  // Only force Free when we confirmed there is no paid Shopify subscription.
  // If the billing API failed, keep the stored plan to avoid accidental downgrades.
  if (billingChecked && current !== "free") {
    await setShopPlan(shop, "free");
    return "free";
  }

  // Persist Free so settings exist and Pricing marks Free as current.
  if (current === "free") {
    try {
      const rows = await prisma.$queryRaw<Array<{ shop: string }>>`
        SELECT "shop"
        FROM "VolumeDiscountSettings"
        WHERE "shop" = ${shop}
        LIMIT 1
      `;
      if (!rows[0]) {
        await setShopPlan(shop, "free");
      }
    } catch {
      await setShopPlan(shop, "free").catch(() => undefined);
    }
  }

  return current;
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
  await ensurePostInstallPricingColumn();
  await prisma.$executeRaw`
    INSERT INTO "VolumeDiscountSettings" (
      "shop",
      "syncInterval",
      "translationsString",
      "plan",
      "postInstallPricingPending",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${shop},
      'disabled',
      '{}',
      ${plan},
      true,
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
