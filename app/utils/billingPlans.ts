import {
  PLANS,
  yearlyTotalCents,
  type PricingInterval,
  type PricingPlanId,
} from "./pricingPlans";

/** Shopify Billing plan keys (also used as AppSubscription `name`). */
export const BILLING_PLAN = {
  freeMonthly: "Offrefy Free",
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
  plan: PricingPlanId,
  interval: PricingInterval,
): BillingPlanKey {
  if (plan === "free") {
    return BILLING_PLAN.freeMonthly;
  }
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
  if (name === BILLING_PLAN.freeMonthly) {
    return "free";
  }
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
  plan: PricingPlanId,
  interval: PricingInterval,
): number {
  if (plan === "free") return 0;
  const cents =
    interval === "yearly"
      ? yearlyTotalCents(PLANS[plan].monthlyCents)
      : PLANS[plan].monthlyCents;
  return cents / 100;
}

/**
 * Shopify test charges (no real money).
 * - Development stores (`partnerDevelopment`) → always test (required to approve)
 * - BILLING_TEST=true  → always test (local / partner testing)
 * - BILLING_TEST=false → live billing (ignored on development stores)
 * - unset → live in production; test in development
 *
 * Live merchant stores must not default to test — that showed
 * "You will not be billed for this test charge."
 */
export function billingIsTest(options?: {
  partnerDevelopment?: boolean;
}): boolean {
  // Dev stores cannot approve real charges — always create test subscriptions.
  if (options?.partnerDevelopment === true) return true;

  const raw = process.env.BILLING_TEST?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return process.env.NODE_ENV !== "production";
}
