import type { CSSProperties } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
} from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Icon,
  Box,
  Badge,
} from "@shopify/polaris";
import { CheckCircleIcon, MinusCircleIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef } from "react";

import { APP_DISPLAY_NAME } from "../branding";
import { PricingTable } from "../components/PricingTable";
import { authenticate } from "../shopify.server";
import {
  FEATURE_COMPARE_ROWS,
  PLANS,
  YEARLY_DISCOUNT_PERCENT,
  isPricingPlanId,
  type PlanFlag,
  type PricingInterval,
  type PricingPlanId,
} from "../utils/pricingPlans";
import {
  billingIsTest,
  pricingPlanFromBillingName,
} from "../utils/billingPlans";
import { resolveShopPlan, setShopPlan } from "../utils/shopPlan.server";
import { scheduleVolumeDiscountShopSync } from "../services/deferredShopSync.server";
import {
  cancelActiveAppSubscriptions,
  createPlanSubscriptionConfirmationUrl,
  listActiveAppSubscriptions,
} from "../services/shopifyBilling.server";
import {
  hasEphemeralBillingParams,
  stripEphemeralBillingSearch,
} from "../utils/adminEmbeddedPath";

export const meta: MetaFunction = () => [
  { title: `Pricing · ${APP_DISPLAY_NAME}` },
];

async function syncPlanFromActiveSubscription(
  shop: string,
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  preferredPlan?: PricingPlanId | null,
): Promise<PricingPlanId> {
  const active = await listActiveAppSubscriptions(admin);
  const match =
    (preferredPlan
      ? active.find(
          (s) => pricingPlanFromBillingName(s.name) === preferredPlan,
        )
      : null) ?? active[0];
  const mapped = pricingPlanFromBillingName(match?.name);
  if (!mapped) {
    return resolveShopPlan(shop);
  }
  if ((await resolveShopPlan(shop)) !== mapped) {
    await setShopPlan(shop, mapped);
  }
  return mapped;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const billingSuccess = url.searchParams.get("billing") === "success";
  const preferredRaw = url.searchParams.get("plan");
  const preferredPlan = isPricingPlanId(preferredRaw) ? preferredRaw : null;

  let currentPlan = await resolveShopPlan(session.shop);
  let justActivated: PricingPlanId | null = null;

  if (billingSuccess) {
    currentPlan = await syncPlanFromActiveSubscription(
      session.shop,
      admin,
      preferredPlan === "free" ? null : preferredPlan,
    );
    justActivated = currentPlan;
  }

  return {
    currentPlan,
    justActivated,
    billingTestMode: billingIsTest(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const planRaw = String(form.get("plan") ?? "");
  const intervalRaw = String(form.get("interval") ?? "monthly");

  if (!isPricingPlanId(planRaw)) {
    return { ok: false as const, error: "Invalid plan" };
  }

  const plan = planRaw as PricingPlanId;
  const interval: PricingInterval =
    intervalRaw === "yearly" ? "yearly" : "monthly";
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const shopHandle = session.shop.replace(/\.myshopify\.com$/i, "");
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const embeddedReturnUrl =
    shopHandle && apiKey
      ? `https://admin.shopify.com/store/${shopHandle}/apps/${apiKey}/app/pricing?billing=success&plan=${plan}`
      : `${appUrl}/app/pricing?billing=success&plan=${plan}`;

  // Free: cancel Shopify subscriptions, then apply free locks.
  if (plan === "free") {
    try {
      await cancelActiveAppSubscriptions(admin, { prorate: true });
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Could not cancel the current subscription",
      };
    }

    const enforce = await setShopPlan(session.shop, plan);
    if (enforce.draftedIds.length > 0) {
      scheduleVolumeDiscountShopSync(admin, session.shop, {
        changedCampaignIds: [
          ...enforce.keptActiveIds,
          ...enforce.draftedIds,
        ],
        skipScheduleTransitions: true,
      });
    }

    const max = PLANS[plan].maxCampaigns;
    const demoteNote =
      enforce.draftedIds.length > 0 && max != null
        ? ` Kept ${enforce.keptActiveIds.length} active (plan max ${max}); moved ${enforce.draftedIds.length} to draft.`
        : "";

    return {
      ok: true as const,
      plan,
      draftedCount: enforce.draftedIds.length,
      keptActiveCount: enforce.keptActiveIds.length,
      message: `Switched to ${PLANS[plan].title}.${demoteNote}`.trim(),
    };
  }

  // Paid: create recurring charge and send merchant to Shopify approve page.
  try {
    const { confirmationUrl } = await createPlanSubscriptionConfirmationUrl(
      admin,
      {
        plan,
        interval,
        returnUrl: embeddedReturnUrl,
        isTest: billingIsTest(),
      },
    );
    return {
      ok: true as const,
      plan,
      confirmationUrl,
      message: `Redirecting to Shopify to approve ${PLANS[plan].title}…`,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not start Shopify billing approval",
    };
  }
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const thFeatureStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  borderBottom: "1px solid var(--p-color-border, #e1e3e5)",
  width: "40%",
};

const thPlanStyle: CSSProperties = {
  textAlign: "center",
  padding: "12px 16px",
  borderBottom: "1px solid var(--p-color-border, #e1e3e5)",
  width: "20%",
};

const tdFeatureStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  borderBottom: "1px solid var(--p-color-border, #e1e3e5)",
  verticalAlign: "middle",
};

const tdPlanStyle: CSSProperties = {
  textAlign: "center",
  padding: "12px 16px",
  borderBottom: "1px solid var(--p-color-border, #e1e3e5)",
  verticalAlign: "middle",
};

function CellValue({ value }: { value: PlanFlag }) {
  if (value === true) {
    return (
      <span
        style={{
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Icon source={CheckCircleIcon} tone="success" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        style={{
          display: "inline-flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Icon source={MinusCircleIcon} tone="subdued" />
      </span>
    );
  }
  return (
    <Text as="span" variant="bodyMd" alignment="center">
      {value}
    </Text>
  );
}

function FeatureCompareTable() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thFeatureStyle}>
              <Text as="span" variant="headingSm">
                Feature
              </Text>
            </th>
            <th style={thPlanStyle}>
              <Text as="span" variant="headingSm" alignment="center">
                Free
              </Text>
            </th>
            <th style={thPlanStyle}>
              <Text as="span" variant="headingSm" alignment="center">
                Standard
              </Text>
            </th>
            <th style={thPlanStyle}>
              <Text as="span" variant="headingSm" alignment="center">
                Premium
              </Text>
            </th>
          </tr>
        </thead>
        <tbody>
          {FEATURE_COMPARE_ROWS.map((row) => (
            <tr key={row.feature}>
              <td style={tdFeatureStyle}>
                <Text as="span" variant="bodyMd">
                  {row.feature}
                </Text>
              </td>
              <td style={tdPlanStyle}>
                <CellValue value={row.free} />
              </td>
              <td style={tdPlanStyle}>
                <CellValue value={row.standard} />
              </td>
              <td style={tdPlanStyle}>
                <CellValue value={row.premium} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PricingPage() {
  const { currentPlan, justActivated } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const wasSubmitting = useRef(false);
  const shownActivationToast = useRef(false);

  useEffect(() => {
    if (!justActivated || shownActivationToast.current) return;
    shownActivationToast.current = true;
    shopify.toast.show(`Activated ${PLANS[justActivated].title} plan`);
    if (hasEphemeralBillingParams(search)) {
      navigate(`${pathname}${stripEphemeralBillingSearch(search)}`, {
        replace: true,
      });
    }
  }, [justActivated, navigate, pathname, search, shopify]);

  useEffect(() => {
    if (fetcher.state !== "idle") {
      wasSubmitting.current = true;
      return;
    }
    if (!wasSubmitting.current) return;
    wasSubmitting.current = false;
    const data = fetcher.data;
    if (!data) return;
    if (data.ok) {
      if ("confirmationUrl" in data && data.confirmationUrl) {
        // Leave the embedded iframe and open Shopify charge approval.
        window.open(data.confirmationUrl, "_top");
        return;
      }
      shopify.toast.show(data.message);
      revalidator.revalidate();
    } else {
      shopify.toast.show(data.error);
    }
  }, [fetcher.state, fetcher.data, revalidator, shopify]);

  const selectPlan = (plan: PricingPlanId, interval: PricingInterval) => {
    if (plan === currentPlan) return;
    const fd = new FormData();
    fd.set("plan", plan);
    fd.set("interval", interval);
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <Page title="Pricing" subtitle="Choose the plan that fits your store.">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Plans
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Free for 5 campaigns · Standard for 25 · Premium unlimited.
                    Save {YEARLY_DISCOUNT_PERCENT}% yearly. Current plan:{" "}
                    {currentPlan}.
                  </Text>
                </BlockStack>
                <PricingTable
                  currentPlan={currentPlan}
                  selecting={fetcher.state !== "idle"}
                  onSelectPlan={selectPlan}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      What’s included
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Compare features across Free, Standard, and Premium.
                    </Text>
                  </BlockStack>
                  <Badge tone="info">All plans</Badge>
                </InlineStack>

                <FeatureCompareTable />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Checkout & cart
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Automatic discounts at cart and checkout · No codes needed ·
                  Powered by Shopify Discount Functions
                </Text>
              </BlockStack>
            </Card>

            <Box paddingBlockEnd="800" />
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
