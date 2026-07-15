import {
  billingAmountDollars,
  billingIsTest,
  billingPlanKeyFor,
  type BillingPlanKey,
} from "../utils/billingPlans";
import type { PricingInterval, PricingPlanId } from "../utils/pricingPlans";

type GraphqlAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $replacementBehavior: AppSubscriptionReplacementBehavior
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      replacementBehavior: $replacementBehavior
      lineItems: $lineItems
    ) {
      confirmationUrl
      appSubscription {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ACTIVE_SUBSCRIPTIONS = `#graphql
  query ActiveAppSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
      }
    }
  }
`;

const APP_SUBSCRIPTION_CANCEL = `#graphql
  mutation AppSubscriptionCancel($id: ID!, $prorate: Boolean) {
    appSubscriptionCancel(id: $id, prorate: $prorate) {
      userErrors {
        field
        message
      }
    }
  }
`;

export type ActiveAppSubscription = {
  id: string;
  name: string;
  status: string;
  test: boolean | null;
};

export async function listActiveAppSubscriptions(
  admin: GraphqlAdmin,
): Promise<ActiveAppSubscription[]> {
  const response = await admin.graphql(ACTIVE_SUBSCRIPTIONS);
  const json = await response.json();
  const subs =
    json?.data?.currentAppInstallation?.activeSubscriptions ?? [];
  return Array.isArray(subs) ? subs : [];
}

export async function cancelActiveAppSubscriptions(
  admin: GraphqlAdmin,
  options?: { prorate?: boolean },
): Promise<void> {
  const prorate = options?.prorate ?? true;
  const active = await listActiveAppSubscriptions(admin);
  for (const sub of active) {
    const response = await admin.graphql(APP_SUBSCRIPTION_CANCEL, {
      variables: { id: sub.id, prorate },
    });
    const json = await response.json();
    const errors = json?.data?.appSubscriptionCancel?.userErrors ?? [];
    if (errors.length > 0) {
      throw new Error(
        errors.map((e: { message: string }) => e.message).join("; ") ||
          "Failed to cancel subscription",
      );
    }
  }
}

/**
 * Creates a recurring app subscription and returns Shopify's approval URL.
 * Merchant must approve the charge before billing (and plan unlock) is active.
 */
export async function createPlanSubscriptionConfirmationUrl(
  admin: GraphqlAdmin,
  options: {
    plan: Exclude<PricingPlanId, "free">;
    interval: PricingInterval;
    returnUrl: string;
    isTest?: boolean;
  },
): Promise<{ confirmationUrl: string; billingPlan: BillingPlanKey }> {
  const { plan, interval, returnUrl } = options;
  const isTest = options.isTest ?? billingIsTest();
  const billingPlan = billingPlanKeyFor(plan, interval);
  const amount = billingAmountDollars(plan, interval);
  const shopifyInterval =
    interval === "yearly" ? "ANNUAL" : "EVERY_30_DAYS";

  const response = await admin.graphql(APP_SUBSCRIPTION_CREATE, {
    variables: {
      name: billingPlan,
      returnUrl,
      test: isTest,
      replacementBehavior: "APPLY_IMMEDIATELY",
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount, currencyCode: "USD" },
              interval: shopifyInterval,
            },
          },
        },
      ],
    },
  });

  const json = await response.json();
  const payload = json?.data?.appSubscriptionCreate;
  const errors = payload?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      errors.map((e: { message: string }) => e.message).join("; ") ||
        "Failed to create subscription",
    );
  }

  const confirmationUrl = payload?.confirmationUrl as string | undefined;
  if (!confirmationUrl) {
    throw new Error("Shopify did not return a confirmation URL");
  }

  return { confirmationUrl, billingPlan };
}
