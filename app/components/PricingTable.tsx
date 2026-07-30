import { useState } from "react";
import { Button, ButtonGroup, Text } from "@shopify/polaris";

import { useAdminI18n } from "./AdminI18nProvider";
import { PricingCard } from "./PricingCard";
import type { AdminUiMessageKey } from "../utils/adminUiMessages";
import {
  getPlanDisplayPrice,
  PAID_PLAN_TRIAL_DAYS,
  PLANS,
  PLAN_ORDER,
  YEARLY_DISCOUNT_PERCENT,
  type PricingInterval,
  type PricingPlanId,
} from "../utils/pricingPlans";

export type { PricingInterval, PricingPlanId };

type PricingTableProps = {
  currentPlan?: PricingPlanId;
  selecting?: boolean;
  onSelectPlan?: (plan: PricingPlanId, interval: PricingInterval) => void;
};

const PLAN_TITLE_KEY: Record<PricingPlanId, AdminUiMessageKey> = {
  free: "pricing.plan.free",
  standard: "pricing.plan.standard",
  premium: "pricing.plan.premium",
};

const PLAN_DESCRIPTION_KEY: Record<PricingPlanId, AdminUiMessageKey> = {
  free: "pricing.plan.free.description",
  standard: "pricing.plan.standard.description",
  premium: "pricing.plan.premium.description",
};

const PLAN_FEATURE_KEYS: Record<PricingPlanId, AdminUiMessageKey[]> = {
  free: [
    "pricing.feature.campaigns5",
    "pricing.feature.quantityBreaks",
    "pricing.feature.volumeDiscount",
    "pricing.feature.classicAppearanceTemplates",
    "pricing.feature.productPageWidget",
    "pricing.feature.automaticCheckout",
    "pricing.feature.basicAnalytics",
    "pricing.feature.emailSupport",
  ],
  standard: [
    "pricing.feature.campaigns25",
    "pricing.feature.quantityBreaks",
    "pricing.feature.volumeDiscount",
    "pricing.feature.standardAppearanceTemplates",
    "pricing.feature.targeting",
    "pricing.feature.schedulingCountdown",
    "pricing.feature.campaignAnalytics",
    "pricing.feature.storefrontTranslations",
    "pricing.feature.emailSupport",
  ],
  premium: [
    "pricing.feature.campaignsUnlimited",
    "pricing.feature.quantityBreaks",
    "pricing.feature.volumeDiscount",
    "pricing.feature.allAppearanceTemplates",
    "pricing.feature.advancedAnalytics",
    "pricing.feature.schedulingAutomation",
    "pricing.feature.importExport",
    "pricing.feature.customCss",
    "pricing.feature.prioritySupport",
  ],
};

export function PricingTable({
  currentPlan = "free",
  selecting = false,
  onSelectPlan,
}: PricingTableProps) {
  const { t } = useAdminI18n();
  const [interval, setInterval] = useState<PricingInterval>("monthly");

  const selectLabel = (plan: PricingPlanId, label: string) =>
    currentPlan === plan ? t("pricing.currentPlan") : label;

  const buttonForPlan = (planId: PricingPlanId) => {
    if (planId === "free") {
      return {
        content: selectLabel("free", t("pricing.selectFree")),
        props: {
          variant:
            currentPlan === "free"
              ? ("secondary" as const)
              : ("tertiary" as const),
          disabled: currentPlan === "free" || selecting,
          onClick: () => onSelectPlan?.("free", interval),
        },
      };
    }
    if (planId === "standard") {
      return {
        content: selectLabel("standard", t("pricing.selectStandard")),
        props: {
          variant:
            currentPlan === "standard"
              ? ("secondary" as const)
              : ("primary" as const),
          // Keep enabled so monthly ↔ yearly still opens Shopify approve.
          disabled: selecting,
          onClick: () => onSelectPlan?.("standard", interval),
        },
      };
    }
    return {
      content: selectLabel("premium", t("pricing.upgradePremium")),
      props: {
        variant:
          currentPlan === "premium"
            ? ("secondary" as const)
            : ("primary" as const),
        disabled: selecting,
        onClick: () => onSelectPlan?.("premium", interval),
      },
    };
  };

  return (
    <s-stack direction="block" gap="large" alignItems="center">
      <s-stack direction="block" gap="small" alignItems="center">
        <ButtonGroup variant="segmented">
          <Button
            pressed={interval === "monthly"}
            onClick={() => setInterval("monthly")}
          >
            {t("pricing.payMonthly")}
          </Button>
          <Button
            pressed={interval === "yearly"}
            onClick={() => setInterval("yearly")}
          >
            {t("pricing.payYearly")}
          </Button>
        </ButtonGroup>
        {interval === "yearly" ? (
          <Text as="p" variant="bodySm" tone="success">
            {t("pricing.saveYearly", { percent: YEARLY_DISCOUNT_PERCENT })}
          </Text>
        ) : null}
      </s-stack>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(17rem, 18rem))",
          gap: "1rem",
          justifyContent: "center",
          alignItems: "stretch",
          width: "100%",
        }}
      >
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const display = getPlanDisplayPrice(planId, interval);
          const isCurrent = currentPlan === planId;
          return (
            <div key={planId} style={{ display: "flex", minHeight: "100%" }}>
              <PricingCard
                title={t(PLAN_TITLE_KEY[planId])}
                description={t(PLAN_DESCRIPTION_KEY[planId])}
                price={display.price}
                comparePrice={display.comparePrice}
                frequency={t("pricing.frequency.month")}
                features={PLAN_FEATURE_KEYS[planId].map((key) => t(key))}
                featuredText={
                  plan.featuredText
                    ? t("pricing.plan.premium.featured")
                    : undefined
                }
                trialText={
                  planId === "standard" || planId === "premium"
                    ? t("pricing.freeTrial", { days: PAID_PLAN_TRIAL_DAYS })
                    : undefined
                }
                selected={isCurrent}
                button={buttonForPlan(planId)}
              />
            </div>
          );
        })}
      </div>
    </s-stack>
  );
}
