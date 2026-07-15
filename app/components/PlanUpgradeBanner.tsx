import { Banner, Button, InlineStack, Text } from "@shopify/polaris";
import { Link, useLocation } from "react-router";

import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import type { PlanFeatureKey } from "../utils/pricingPlans";
import { upgradeMessage } from "../utils/pricingPlans";

type PlanUpgradeBannerProps = {
  feature: PlanFeatureKey;
  /** Override default upgrade copy. */
  message?: string;
};

export function PlanUpgradeBanner({
  feature,
  message,
}: PlanUpgradeBannerProps) {
  const { search } = useLocation();
  const pricingHref = adminEmbeddedPath("/app/pricing", search);

  return (
    <Banner tone="warning" title="Upgrade to unlock">
      <InlineStack gap="300" blockAlign="center" wrap>
        <Text as="p" variant="bodyMd">
          {message ?? upgradeMessage(feature)}
        </Text>
        <Button url={pricingHref} variant="primary" size="slim">
          View plans
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
  const { search } = useLocation();
  const pricingHref = adminEmbeddedPath("/app/pricing", search);

  return (
    <Text as="p" variant="bodySm" tone="caution">
      {message ?? upgradeMessage(feature)}{" "}
      <Link to={pricingHref}>Upgrade plan</Link>
    </Text>
  );
}
