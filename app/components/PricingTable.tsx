import { useState } from "react";
import { Button, ButtonGroup, Text } from "@shopify/polaris";

import { PricingCard } from "./PricingCard";
import {
  getPlanDisplayPrice,
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

export function PricingTable({
  currentPlan = "free",
  selecting = false,
  onSelectPlan,
}: PricingTableProps) {
  const [interval, setInterval] = useState<PricingInterval>("monthly");

  const selectLabel = (plan: PricingPlanId, label: string) =>
    currentPlan === plan ? "Current plan" : label;

  const buttonForPlan = (planId: PricingPlanId) => {
    if (planId === "free") {
      return {
        content: selectLabel("free", "Downgrade"),
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
        content: selectLabel("standard", "Select Standard"),
        props: {
          variant:
            currentPlan === "standard"
              ? ("secondary" as const)
              : ("primary" as const),
          disabled: currentPlan === "standard" || selecting,
          onClick: () => onSelectPlan?.("standard", interval),
        },
      };
    }
    return {
      content: selectLabel("premium", "Upgrade to Premium"),
      props: {
        variant: "primary" as const,
        disabled: currentPlan === "premium" || selecting,
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
            Pay monthly
          </Button>
          <Button
            pressed={interval === "yearly"}
            onClick={() => setInterval("yearly")}
          >
            Pay yearly
          </Button>
        </ButtonGroup>
        {interval === "yearly" ? (
          <Text as="p" variant="bodySm" tone="success">
            Save {YEARLY_DISCOUNT_PERCENT}% with yearly billing
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
          return (
            <div key={planId} style={{ display: "flex", minHeight: "100%" }}>
              <PricingCard
                title={plan.title}
                description={plan.description}
                price={display.price}
                comparePrice={display.comparePrice}
                frequency={display.frequency}
                features={plan.cardFeatures}
                featuredText={plan.featuredText}
                button={buttonForPlan(planId)}
              />
            </div>
          );
        })}
      </div>
    </s-stack>
  );
}
