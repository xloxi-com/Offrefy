import {
  PLANS,
  yearlyTotalCents,
  type PricingInterval,
  type PricingPlanId,
} from "./pricingPlans";

/** Shopify Billing plan keys (also used as AppSubscription `name`). */
export const BILLING_PLAN = {
  standardMonthly: "Offrefy Standard",
  standardYearly: "Offrefy Standard (Yearly)",
  premiumMonthly: "Offrefy Premium",
  premiumYearly: "Offrefy Premium (Yearly)",
} as const;

export type BillingPlanKey = (typeof BILLING_PLAN)[keyof typeof BILLING_PLAN];

export const PAID_BILLING_PLAN_KEYS: BillingPlanKey[] = [
  BILLING_PLAN.standardMonthly,
  BILLING_PLAN.standardYearly,
  BILLING_PLAN.premiumMonthly,
  BILLING_PLAN.premiumYearly,
];

export function billingPlanKeyFor(
  plan: Exclude<PricingPlanId, "free">,
  interval: PricingInterval,
): BillingPlanKey {
  if (plan === "standard") {
    return interval === "yearly"
      ? BILLING_PLAN.standardYearly
      : BILLING_PLAN.standardMonthly;
  }
  return interval === "yearly"
    ? BILLING_PLAN.premiumYearly
    : BILLING_PLAN.premiumMonthly;
}

export function pricingPlanFromBillingName(
  name: string | null | undefined,
): PricingPlanId | null {
  if (!name) return null;
  if (
    name === BILLING_PLAN.premiumMonthly ||
    name === BILLING_PLAN.premiumYearly
  ) {
    return "premium";
  }
  if (
    name === BILLING_PLAN.standardMonthly ||
    name === BILLING_PLAN.standardYearly
  ) {
    return "standard";
  }
  return null;
}

/** Recurring amount in dollars for Shopify Billing line item. */
export function billingAmountDollars(
  plan: Exclude<PricingPlanId, "free">,
  interval: PricingInterval,
): number {
  const cents =
    interval === "yearly"
      ? yearlyTotalCents(PLANS[plan].monthlyCents)
      : PLANS[plan].monthlyCents;
  return cents / 100;
}

/** Dev stores must use test charges. Set BILLING_TEST=false for live charges. */
export function billingIsTest(): boolean {
  return process.env.BILLING_TEST !== "false";
}
