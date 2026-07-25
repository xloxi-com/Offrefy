import { Banner, Button, InlineStack, Text } from "@shopify/polaris";
import { Link, useLocation } from "react-router";

import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import type { PlanFeatureKey } from "../utils/pricingPlans";
import { upgradeMessage } from "../utils/pricingPlans";
import { useAdminI18n } from "./AdminI18nProvider";
import { PlanUpgradeBadge } from "./PlanUpgradeBadge";

type PlanUpgradeBannerProps = {
  feature: PlanFeatureKey;
  /** Override default upgrade copy. */
  message?: string;
};

export function PlanUpgradeBanner({
  feature,
  message,
}: PlanUpgradeBannerProps) {
  const { t } = useAdminI18n();
  const { search } = useLocation();
  const pricingHref = adminEmbeddedPath("/app/pricing", search);

  return (
    <Banner tone="warning" title={t("common.upgradeToUnlock")}>
      <InlineStack gap="300" blockAlign="center" wrap>
        <Text as="p" variant="bodyMd">
          {message ?? upgradeMessage(feature)}
        </Text>
        <Button url={pricingHref} variant="primary" size="slim">
          {t("common.viewPlans")}
        </Button>
      </InlineStack>
    </Banner>
  );
}

/** Compact upgrade hint for locked form fields. */
export function PlanUpgradeHint({
  feature,
  message,
}: PlanUpgradeBannerProps) {
  const { t } = useAdminI18n();
  const { search } = useLocation();
  const pricingHref = adminEmbeddedPath("/app/pricing", search);

  return (
    <InlineStack gap="200" blockAlign="center" wrap>
      <PlanUpgradeBadge />
      <Text as="p" variant="bodySm" tone="caution">
        {message ?? upgradeMessage(feature)}{" "}
        <Link to={pricingHref}>{t("common.upgradePlan")}</Link>
      </Text>
    </InlineStack>
  );
}
