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
import { useAdminI18n } from "../components/AdminI18nProvider";
import { PricingTable } from "../components/PricingTable";
import { authenticate } from "../shopify.server";
import type { AdminUiMessageKey } from "../utils/adminUiMessages";
import {
  FEATURE_COMPARE_ROWS,
  YEARLY_DISCOUNT_PERCENT,
  getMaxActiveCampaigns,
  isPricingPlanId,
  type PlanFlag,
  type PricingInterval,
  type PricingPlanId,
} from "../utils/pricingPlans";
import {
  billingIsTest,
  pricingPlanFromBillingName,
} from "../utils/billingPlans";
import { resolveShopPlan, setShopPlan, ensureDefaultFreePlanOnInstall } from "../utils/shopPlan.server";
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

  let currentPlan = await ensureDefaultFreePlanOnInstall(session.shop, admin);
  let justActivated: PricingPlanId | null = null;

  if (billingSuccess) {
    currentPlan = await syncPlanFromActiveSubscription(
      session.shop,
      admin,
      preferredPlan,
    );
    // Enforce free-plan campaign caps after merchant approved the charge.
    if (currentPlan === "free" || preferredPlan === "free") {
      const enforce = await setShopPlan(session.shop, "free");
      currentPlan = "free";
      if (enforce.draftedIds.length > 0) {
        scheduleVolumeDiscountShopSync(admin, session.shop, {
          changedCampaignIds: [
            ...enforce.keptActiveIds,
            ...enforce.draftedIds,
          ],
          skipScheduleTransitions: true,
        });
      }
    }
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

  // Free is $0 — Shopify rejects appSubscriptionCreate with amount 0.
  // Downgrade locally: cancel paid charges, then persist Free.
  if (plan === "free") {
    try {
      await cancelActiveAppSubscriptions(admin);
      const enforce = await setShopPlan(session.shop, "free");
      if (enforce.draftedIds.length > 0) {
        scheduleVolumeDiscountShopSync(admin, session.shop, {
          changedCampaignIds: [
            ...enforce.keptActiveIds,
            ...enforce.draftedIds,
          ],
          skipScheduleTransitions: true,
        });
      }
      return {
        ok: true as const,
        plan,
        draftedCount: enforce.draftedIds.length,
        keptActiveCount: enforce.keptActiveIds.length,
        maxCampaigns: getMaxActiveCampaigns("free"),
        message: "switched",
      };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Could not switch to Free",
      };
    }
  }

  // Paid plans go through Shopify approval via appSubscriptionCreate.
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
      message: "redirecting",
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

const PLAN_TITLE_KEY: Record<PricingPlanId, AdminUiMessageKey> = {
  free: "pricing.plan.free",
  standard: "pricing.plan.standard",
  premium: "pricing.plan.premium",
};

const COMPARE_FEATURE_KEY: Record<string, AdminUiMessageKey> = {
  activeCampaigns: "pricing.compare.activeCampaigns",
  quantityBreaks: "pricing.compare.quantityBreaks",
  volumeDiscount: "pricing.compare.volumeDiscount",
  appearanceTemplates: "pricing.compare.appearanceTemplates",
  productPageWidget: "pricing.compare.productPageWidget",
  automaticCheckout: "pricing.compare.automaticCheckout",
  discountTypes: "pricing.compare.discountTypes",
  productCollectionTargeting: "pricing.compare.productCollectionTargeting",
  customerTargeting: "pricing.compare.customerTargeting",
  countdownTimers: "pricing.compare.countdownTimers",
  offerScheduling: "pricing.compare.offerScheduling",
  campaignAnalytics: "pricing.compare.campaignAnalytics",
  storefrontTranslations: "pricing.compare.storefrontTranslations",
  schedulingAutomation: "pricing.compare.schedulingAutomation",
  importExport: "pricing.compare.importExport",
  customCss: "pricing.compare.customCss",
  setupGuide: "pricing.compare.setupGuide",
  emailSupport: "pricing.compare.emailSupport",
};

const FLAG_VALUE_KEY: Record<string, AdminUiMessageKey> = {
  Unlimited: "pricing.value.unlimited",
  Basic: "pricing.value.basic",
  Advanced: "pricing.value.advanced",
  Priority: "pricing.value.priority",
};

function CellValue({
  value,
  translateFlag,
}: {
  value: PlanFlag;
  translateFlag: (raw: string) => string;
}) {
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
      {translateFlag(value)}
    </Text>
  );
}

function FeatureCompareTable() {
  const { t } = useAdminI18n();

  const translateFlag = (raw: string) => {
    const key = FLAG_VALUE_KEY[raw];
    return key ? t(key) : raw;
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thFeatureStyle}>
              <Text as="span" variant="headingSm">
                {t("pricing.compare.feature")}
              </Text>
            </th>
            <th style={thPlanStyle}>
              <Text as="span" variant="headingSm" alignment="center">
                {t("pricing.plan.free")}
              </Text>
            </th>
            <th style={thPlanStyle}>
              <Text as="span" variant="headingSm" alignment="center">
                {t("pricing.plan.standard")}
              </Text>
            </th>
            <th style={thPlanStyle}>
              <Text as="span" variant="headingSm" alignment="center">
                {t("pricing.plan.premium")}
              </Text>
            </th>
          </tr>
        </thead>
        <tbody>
          {FEATURE_COMPARE_ROWS.map((row) => (
            <tr key={row.id}>
              <td style={tdFeatureStyle}>
                <Text as="span" variant="bodyMd">
                  {t(COMPARE_FEATURE_KEY[row.id] ?? "pricing.compare.feature")}
                </Text>
              </td>
              <td style={tdPlanStyle}>
                <CellValue value={row.free} translateFlag={translateFlag} />
              </td>
              <td style={tdPlanStyle}>
                <CellValue value={row.standard} translateFlag={translateFlag} />
              </td>
              <td style={tdPlanStyle}>
                <CellValue value={row.premium} translateFlag={translateFlag} />
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
  const { t } = useAdminI18n();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const wasSubmitting = useRef(false);
  const shownActivationToast = useRef(false);

  const planTitle = (plan: PricingPlanId) => t(PLAN_TITLE_KEY[plan]);

  useEffect(() => {
    if (!justActivated || shownActivationToast.current) return;
    shownActivationToast.current = true;
    shopify.toast.show(
      t("pricing.toast.activated", {
        plan: t(PLAN_TITLE_KEY[justActivated]),
      }),
    );
    if (hasEphemeralBillingParams(search)) {
      navigate(`${pathname}${stripEphemeralBillingSearch(search)}`, {
        replace: true,
      });
    }
  }, [justActivated, navigate, pathname, search, shopify, t]);

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
        // Break out of the embedded iframe to Shopify's charge approval page.
        const url = data.confirmationUrl;
        try {
          if (window.top) {
            window.top.location.href = url;
          } else {
            window.location.href = url;
          }
        } catch {
          window.open(url, "_top");
        }
        return;
      }
      const title = t(PLAN_TITLE_KEY[data.plan]);
      let message = t("pricing.toast.switched", { plan: title });
      if (
        "draftedCount" in data &&
        typeof data.draftedCount === "number" &&
        data.draftedCount > 0 &&
        data.maxCampaigns != null
      ) {
        message += t("pricing.toast.switchedDemote", {
          kept: data.keptActiveCount,
          max: data.maxCampaigns,
          drafted: data.draftedCount,
        });
      }
      shopify.toast.show(message.trim());
      revalidator.revalidate();
    } else {
      shopify.toast.show(data.error);
    }
  }, [fetcher.state, fetcher.data, revalidator, shopify, t]);

  const selectPlan = (plan: PricingPlanId, interval: PricingInterval) => {
    // Already on Free — nothing to approve. Paid → allow re-select to change
    // monthly/yearly or re-open Shopify billing.
    if (plan === currentPlan && plan === "free") return;
    const fd = new FormData();
    fd.set("plan", plan);
    fd.set("interval", interval);
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <Page
      title={t("pricing.title")}
      subtitle={t("pricing.subtitle")}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    {t("pricing.plansHeading")}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {t("pricing.plansIntro", {
                      percent: YEARLY_DISCOUNT_PERCENT,
                      plan: planTitle(currentPlan),
                    })}
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
                      {t("pricing.whatsIncluded")}
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {t("pricing.whatsIncludedSubtitle")}
                    </Text>
                  </BlockStack>
                  <Badge tone="info">{t("pricing.allPlans")}</Badge>
                </InlineStack>

                <FeatureCompareTable />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {t("pricing.checkoutTitle")}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  {t("pricing.checkoutBody")}
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
