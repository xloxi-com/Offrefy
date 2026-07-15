/**
 * Single source of truth for Offrefy plan prices, limits, and feature lists.
 * All money math uses integer cents to avoid float bugs.
 */

export type PricingInterval = "monthly" | "yearly";
export type PricingPlanId = "free" | "standard" | "premium";

/** Yearly billing discount vs monthly list price (percent). */
export const YEARLY_DISCOUNT_PERCENT = 20;

export type PlanFlag = true | false | string;

export type FeatureCompareRow = {
  feature: string;
  free: PlanFlag;
  standard: PlanFlag;
  premium: PlanFlag;
};

export type PlanDefinition = {
  id: PricingPlanId;
  title: string;
  description: string;
  /** Monthly list price in cents. Free = 0. */
  monthlyCents: number;
  /** Max active campaigns; null = unlimited. */
  maxCampaigns: number | null;
  featuredText?: string;
  cardFeatures: string[];
};

export type PlanDisplayPrice = {
  price: string;
  comparePrice?: string;
  frequency: "month";
  /** Effective monthly cents shown in `price`. */
  displayCents: number;
  /** Full year charge when billed yearly (yearly per-month × 12). */
  yearlyTotalCents?: number;
};

export const PLANS: Record<PricingPlanId, PlanDefinition> = {
  free: {
    id: "free",
    title: "Free",
    description: "Quantity breaks, volume discount, and templates.",
    monthlyCents: 0,
    maxCampaigns: 5,
    cardFeatures: [
      "5 active campaigns",
      "Quantity breaks (tier cards)",
      "Volume discount (pricing table)",
      "Appearance templates",
      "Product page widget",
      "Automatic checkout discounts",
      "Basic analytics",
      "Email support",
    ],
  },
  standard: {
    id: "standard",
    title: "Standard",
    description: "Targeting, scheduling, and campaign analytics.",
    monthlyCents: 899,
    maxCampaigns: 25,
    cardFeatures: [
      "25 active campaigns",
      "Quantity breaks (tier cards)",
      "Volume discount (pricing table)",
      "Appearance templates",
      "Product, collection & customer targeting",
      "Offer scheduling & countdown timers",
      "Campaign analytics",
      "Storefront translations",
      "Email support",
    ],
  },
  premium: {
    id: "premium",
    title: "Premium",
    description: "Unlimited campaigns, import/export, and advanced analytics.",
    monthlyCents: 1999,
    maxCampaigns: null,
    featuredText: "Most popular",
    cardFeatures: [
      "Unlimited campaigns",
      "Quantity breaks (tier cards)",
      "Volume discount (pricing table)",
      "All appearance templates",
      "Advanced analytics & attribution",
      "Scheduling & automation",
      "Import & export (CSV / Excel)",
      "Custom CSS & advanced styling",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: PricingPlanId[] = ["free", "standard", "premium"];

export function formatMoneyFromCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/** Effective monthly rate in cents when billed yearly (rounded). */
export function yearlyPerMonthCents(monthlyCents: number): number {
  return Math.round(
    (monthlyCents * (100 - YEARLY_DISCOUNT_PERCENT)) / 100,
  );
}

export function yearlyTotalCents(monthlyCents: number): number {
  return yearlyPerMonthCents(monthlyCents) * 12;
}

export function getMaxActiveCampaigns(
  planId: PricingPlanId,
): number | null {
  return PLANS[planId].maxCampaigns;
}

export type AnalyticsTier = "basic" | "standard" | "advanced";

export type PlanCapabilities = {
  maxActiveCampaigns: number | null;
  customerTargeting: boolean;
  scheduling: boolean;
  countdown: boolean;
  translations: boolean;
  analytics: AnalyticsTier;
  schedulingAutomation: boolean;
  importExport: boolean;
  customCss: boolean;
};

export type PlanFeatureKey =
  | "activeCampaigns"
  | "customerTargeting"
  | "scheduling"
  | "countdown"
  | "translations"
  | "analytics"
  | "schedulingAutomation"
  | "importExport"
  | "customCss";

export function isPricingPlanId(value: unknown): value is PricingPlanId {
  return value === "free" || value === "standard" || value === "premium";
}

export function planCapabilities(planId: PricingPlanId): PlanCapabilities {
  switch (planId) {
    case "premium":
      return {
        maxActiveCampaigns: null,
        customerTargeting: true,
        scheduling: true,
        countdown: true,
        translations: true,
        analytics: "advanced",
        schedulingAutomation: true,
        importExport: true,
        customCss: true,
      };
    case "standard":
      return {
        maxActiveCampaigns: 25,
        customerTargeting: true,
        scheduling: true,
        countdown: true,
        translations: true,
        analytics: "standard",
        schedulingAutomation: false,
        importExport: false,
        customCss: false,
      };
    case "free":
    default:
      return {
        maxActiveCampaigns: 5,
        customerTargeting: false,
        scheduling: false,
        countdown: false,
        translations: false,
        analytics: "basic",
        schedulingAutomation: false,
        importExport: false,
        customCss: false,
      };
  }
}

/** True if the shop can create one more offer (total campaigns including drafts). */
export function canCreateAnotherOffer(
  planId: PricingPlanId,
  totalOfferCount: number,
): boolean {
  const max = getMaxActiveCampaigns(planId);
  if (max == null) return true;
  return totalOfferCount < max;
}

export function createOfferBlockedMessage(planId: PricingPlanId): string {
  const max = getMaxActiveCampaigns(planId);
  const title = PLANS[planId].title;
  if (max == null) {
    return upgradeMessage("activeCampaigns");
  }
  return `Your ${title} plan allows up to ${max} offers. Upgrade to create more.`;
}

/** True if the shop can activate one more campaign (activeCount = current actives). */
export function canActivateAnotherCampaign(
  planId: PricingPlanId,
  activeCount: number,
): boolean {
  const max = getMaxActiveCampaigns(planId);
  if (max == null) return true;
  return activeCount < max;
}

/** How many more campaigns can still be activated. null = unlimited. */
export function remainingActivations(
  planId: PricingPlanId,
  activeCount: number,
): number | null {
  const max = getMaxActiveCampaigns(planId);
  if (max == null) return null;
  return Math.max(0, max - activeCount);
}

const UPGRADE_MESSAGES: Record<PlanFeatureKey, string> = {
  activeCampaigns:
    "You’ve reached your plan’s offer limit. Upgrade to create or activate more.",
  customerTargeting:
    "Customer targeting is available on Standard and Premium. Upgrade to unlock.",
  scheduling:
    "Offer scheduling is available on Standard and Premium. Upgrade to unlock.",
  countdown:
    "Countdown timers are available on Standard and Premium. Upgrade to unlock.",
  translations:
    "Storefront translations are available on Standard and Premium. Upgrade to unlock.",
  analytics:
    "Advanced analytics are available on a higher plan. Upgrade to unlock.",
  schedulingAutomation:
    "Scheduling automation is available on Premium. Upgrade to unlock.",
  importExport:
    "Import & export is available on Premium. Upgrade to unlock.",
  customCss:
    "Custom CSS is available on Premium. Upgrade to unlock.",
};

export function upgradeMessage(featureKey: PlanFeatureKey): string {
  return UPGRADE_MESSAGES[featureKey];
}

export function minPlanForFeature(featureKey: PlanFeatureKey): PricingPlanId {
  switch (featureKey) {
    case "importExport":
    case "customCss":
    case "schedulingAutomation":
    case "analytics":
      return featureKey === "analytics" ? "standard" : "premium";
    case "customerTargeting":
    case "scheduling":
    case "countdown":
    case "translations":
    case "activeCampaigns":
      return "standard";
    default:
      return "standard";
  }
}

/**
 * Display price for a plan card.
 * Yearly interval shows per-month equivalent + struck compare-at (monthly list).
 */
export function getPlanDisplayPrice(
  planId: PricingPlanId,
  interval: PricingInterval,
): PlanDisplayPrice {
  const { monthlyCents } = PLANS[planId];

  if (monthlyCents === 0) {
    return {
      price: formatMoneyFromCents(0),
      frequency: "month",
      displayCents: 0,
    };
  }

  if (interval === "yearly") {
    const perMonth = yearlyPerMonthCents(monthlyCents);
    return {
      price: formatMoneyFromCents(perMonth),
      comparePrice: formatMoneyFromCents(monthlyCents),
      frequency: "month",
      displayCents: perMonth,
      yearlyTotalCents: perMonth * 12,
    };
  }

  return {
    price: formatMoneyFromCents(monthlyCents),
    frequency: "month",
    displayCents: monthlyCents,
  };
}

/** Comparison-table rows for Free / Standard / Premium. */
export const FEATURE_COMPARE_ROWS: FeatureCompareRow[] = [
  {
    feature: "Active campaigns",
    free: "5",
    standard: "25",
    premium: "Unlimited",
  },
  {
    feature: "Quantity breaks (tier cards)",
    free: true,
    standard: true,
    premium: true,
  },
  {
    feature: "Volume discount (pricing table)",
    free: true,
    standard: true,
    premium: true,
  },
  {
    feature: "Appearance templates",
    free: true,
    standard: true,
    premium: true,
  },
  {
    feature: "Product page widget",
    free: true,
    standard: true,
    premium: true,
  },
  {
    feature: "Automatic checkout discounts",
    free: true,
    standard: true,
    premium: true,
  },
  {
    feature: "Discount types (% / amount / fixed)",
    free: true,
    standard: true,
    premium: true,
  },
  {
    feature: "Product & collection targeting",
    free: true,
    standard: true,
    premium: true,
  },
  {
    feature: "Customer targeting (tags / login)",
    free: false,
    standard: true,
    premium: true,
  },
  {
    feature: "Countdown timers",
    free: false,
    standard: true,
    premium: true,
  },
  {
    feature: "Offer scheduling",
    free: false,
    standard: true,
    premium: true,
  },
  {
    feature: "Campaign analytics",
    free: "Basic",
    standard: true,
    premium: "Advanced",
  },
  {
    feature: "Storefront translations",
    free: false,
    standard: true,
    premium: true,
  },
  {
    feature: "Scheduling & automation",
    free: false,
    standard: false,
    premium: true,
  },
  {
    feature: "Import & export (CSV / Excel)",
    free: false,
    standard: false,
    premium: true,
  },
  {
    feature: "Custom CSS & advanced styling",
    free: false,
    standard: false,
    premium: true,
  },
  {
    feature: "Setup guide & theme embed",
    free: true,
    standard: true,
    premium: true,
  },
  {
    feature: "Email support",
    free: true,
    standard: true,
    premium: "Priority",
  },
];
