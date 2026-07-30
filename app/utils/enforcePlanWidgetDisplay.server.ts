/**
 * Persist plan-safe widgetDisplay on campaigns after upgrade/downgrade.
 * Storefront metafield must still be refreshed separately (needs Admin API).
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "../db.server";
import {
  clampWidgetDisplayAppearanceForPlan,
} from "./appearanceTemplateAccess";
import { planCapabilities, type PricingPlanId } from "./pricingPlans";
import {
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "./widgetDisplay";

function widgetDisplayEquals(
  a: VolumeDiscountWidgetDisplay,
  b: VolumeDiscountWidgetDisplay,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Strip / replace appearance (and related gates) that the plan no longer allows. */
export function widgetDisplayEnforcedForPlan(
  planId: PricingPlanId,
  raw: unknown,
): VolumeDiscountWidgetDisplay {
  const caps = planCapabilities(planId);
  let wd = clampWidgetDisplayAppearanceForPlan(
    planId,
    normalizeVolumeDiscountWidgetDisplay(raw ?? {}),
  );
  if (!caps.customCss && wd.customCss) {
    wd = { ...wd, customCss: "" };
  }
  if (!caps.countdown && wd.showCountdown) {
    wd = { ...wd, showCountdown: false };
  }
  return wd;
}

/**
 * Rewrite campaign widgetDisplay rows that exceed the plan (e.g. Premium template
 * after downgrade). Returns how many campaigns were updated.
 */
export async function clampCampaignWidgetDisplaysForPlan(
  shop: string,
  planId: PricingPlanId,
): Promise<number> {
  const rows = await prisma.volumeDiscountCampaign.findMany({
    where: { shop },
    select: { id: true, widgetDisplay: true },
  });

  let updated = 0;
  for (const row of rows) {
    const current = normalizeVolumeDiscountWidgetDisplay(
      row.widgetDisplay ?? {},
    );
    const next = widgetDisplayEnforcedForPlan(planId, row.widgetDisplay);
    if (widgetDisplayEquals(current, next)) continue;

    await prisma.volumeDiscountCampaign.update({
      where: { id: row.id },
      data: {
        widgetDisplay: next as unknown as Prisma.InputJsonValue,
      },
    });
    updated += 1;
  }
  return updated;
}
