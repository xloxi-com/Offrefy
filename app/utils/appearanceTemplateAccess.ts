/**
 * Plan gates for appearance templates.
 * All plans: full template library (tier still used for clamp helpers).
 */

import type {
  AppearanceTemplatesTier,
  PricingPlanId,
} from "./pricingPlans";
import { planCapabilities } from "./pricingPlans";
import {
  appearanceCategoryForPresetId,
  appearancePresetsForCategory,
  applyVolumeDiscountAppearancePreset,
  applyVolumeTableAppearancePreset,
  type AppearanceTemplateCategory,
  type VolumeDiscountAppearancePresetId,
  type VolumeDiscountAppearanceTemplateId,
  type VolumeDiscountWidgetDisplay,
} from "./widgetDisplay";

/** How many templates per seasonal category Standard unlocks (first N in category order). */
export const STANDARD_SEASONAL_TEMPLATES_PER_CATEGORY = 3;

const FALLBACK_CLASSIC_PRESET: VolumeDiscountAppearancePresetId =
  "classic_burgundy";

export function isSeasonalAppearanceCategory(
  category: AppearanceTemplateCategory,
): boolean {
  return category !== "classic";
}

/** Preset ids unlocked for Standard within a seasonal category (empty for classic — all classic are free). */
export function standardUnlockedPresetIdsForCategory(
  category: AppearanceTemplateCategory,
): VolumeDiscountAppearancePresetId[] {
  if (category === "classic") return [];
  return appearancePresetsForCategory(category)
    .slice(0, STANDARD_SEASONAL_TEMPLATES_PER_CATEGORY)
    .map((row) => row.id);
}

export function isAppearancePresetAllowedForTier(
  tier: AppearanceTemplatesTier,
  templateId: VolumeDiscountAppearanceTemplateId,
): boolean {
  if (templateId === "custom") return true;
  if (tier === "all") return true;

  const category = appearanceCategoryForPresetId(templateId);
  if (category === "classic") return true;
  if (tier === "classic") return false;

  return standardUnlockedPresetIdsForCategory(category).includes(templateId);
}

export function isAppearancePresetAllowed(
  planId: PricingPlanId,
  templateId: VolumeDiscountAppearanceTemplateId,
): boolean {
  return isAppearancePresetAllowedForTier(
    planCapabilities(planId).appearanceTemplates,
    templateId,
  );
}

/**
 * If the current template is above the plan, fall back to an allowed preset
 * (prefer first unlocked in the same season on Standard; else classic).
 */
export function clampAppearanceTemplateIdForTier(
  tier: AppearanceTemplatesTier,
  templateId: VolumeDiscountAppearanceTemplateId,
): VolumeDiscountAppearanceTemplateId {
  if (isAppearancePresetAllowedForTier(tier, templateId)) return templateId;
  if (templateId === "custom") return "custom";

  const category = appearanceCategoryForPresetId(templateId);
  if (tier === "seasonal_limited" && category !== "classic") {
    const first = standardUnlockedPresetIdsForCategory(category)[0];
    if (first) return first;
  }
  return FALLBACK_CLASSIC_PRESET;
}

export function clampAppearanceTemplateId(
  planId: PricingPlanId,
  templateId: VolumeDiscountAppearanceTemplateId,
): VolumeDiscountAppearanceTemplateId {
  return clampAppearanceTemplateIdForTier(
    planCapabilities(planId).appearanceTemplates,
    templateId,
  );
}

/**
 * Enforce plan on full widget styles (not only template id).
 * Locked presets are fully replaced with an allowed preset so premium colors/decor
 * never reach the storefront. Admin preview can still apply locked presets in-memory.
 */
export function clampWidgetDisplayAppearanceForTier(
  tier: AppearanceTemplatesTier,
  display: VolumeDiscountWidgetDisplay,
): VolumeDiscountWidgetDisplay {
  const id = display.appearanceTemplateId;

  if (id !== "custom" && !isAppearancePresetAllowedForTier(tier, id)) {
    const allowedId = clampAppearanceTemplateIdForTier(tier, id);
    if (allowedId === "custom") return display;
    return display.widgetPresentation === "volume_table"
      ? applyVolumeTableAppearancePreset(display, allowedId)
      : applyVolumeDiscountAppearancePreset(display, allowedId);
  }

  const decor = display.appearanceDecorThemeId;
  if (decor && !isAppearancePresetAllowedForTier(tier, decor)) {
    return {
      ...display,
      appearanceDecorThemeId: "",
    };
  }

  return display;
}

export function clampWidgetDisplayAppearanceForPlan(
  planId: PricingPlanId,
  display: VolumeDiscountWidgetDisplay,
): VolumeDiscountWidgetDisplay {
  return clampWidgetDisplayAppearanceForTier(
    planCapabilities(planId).appearanceTemplates,
    display,
  );
}

/** True when the selected template (or seasonal decor) is above the plan. */
export function isWidgetDisplayAppearanceAbovePlan(
  tier: AppearanceTemplatesTier,
  display: VolumeDiscountWidgetDisplay,
): boolean {
  const id = display.appearanceTemplateId;
  if (id !== "custom" && !isAppearancePresetAllowedForTier(tier, id)) {
    return true;
  }
  const decor = display.appearanceDecorThemeId;
  if (decor && !isAppearancePresetAllowedForTier(tier, decor)) {
    return true;
  }
  return false;
}

/** Copy when save is blocked because a locked template is selected. */
export function appearanceTemplateSaveBlockedMessage(
  tier: AppearanceTemplatesTier,
): string {
  if (tier === "classic") {
    return "Standard unlocks 3 templates per season. Premium unlocks all. Upgrade to save this template.";
  }
  return "This appearance template is available on Premium. Upgrade to unlock before saving.";
}
