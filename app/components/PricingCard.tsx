import type { ComponentProps, CSSProperties } from "react";

import { useAdminI18n } from "./AdminI18nProvider";

type PricingButton = {
  content: string;
  props?: ComponentProps<"s-button">;
};

export type PricingCardProps = {
  title: string;
  description?: string;
  price: string;
  /** Struck-through compare-at price (e.g. monthly rate when yearly is selected). */
  comparePrice?: string;
  frequency: string;
  features: string[];
  featuredText?: string;
  /** Merchant's active plan — highlight as selected. */
  selected?: boolean;
  button: PricingButton;
};

export function PricingCard({
  title,
  description,
  price,
  comparePrice,
  features,
  featuredText,
  selected = false,
  button,
  frequency,
}: PricingCardProps) {
  const { t } = useAdminI18n();

  const cardStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    display: "grid",
    gridTemplateRows: "auto auto 1fr auto",
    gap: "1.25rem",
    padding: "1rem",
    boxShadow: featuredText && !selected ? "0px 0px 15px 4px #CDFEE1" : "none",
    borderRadius: "0.75rem",
    background: "var(--p-color-bg-surface, #fff)",
    border: selected
      ? "2px solid var(--p-color-border-success, #29845a)"
      : "1px solid var(--p-color-border, #e1e3e5)",
    position: "relative",
    zIndex: 0,
  };

  return (
    <div style={cardStyle}>
      {selected ? (
        <div
          style={{
            position: "absolute",
            top: "-15px",
            left: "6px",
            zIndex: 100,
          }}
        >
          <s-badge tone="success">{t("pricing.selected")}</s-badge>
        </div>
      ) : null}
      {featuredText && !selected ? (
        <div
          style={{
            position: "absolute",
            top: "-15px",
            right: "6px",
            zIndex: 100,
          }}
        >
          <s-badge tone="success">{featuredText}</s-badge>
        </div>
      ) : null}

      <div>
        <h2 style={{ fontSize: "20px", fontWeight: "bold", margin: 0 }}>
          {title}
        </h2>
        {description ? (
          <div style={{ marginTop: "0.5rem" }}>
            <s-paragraph color="subdued">{description}</s-paragraph>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.35rem",
          flexWrap: "wrap",
        }}
      >
        {comparePrice ? (
          <span
            style={{
              fontSize: "14px",
              color: "var(--p-color-text-secondary, #6d7175)",
              textDecoration: "line-through",
            }}
          >
            {comparePrice}
          </span>
        ) : null}
        <h3 style={{ fontSize: "28px", fontWeight: "bold", margin: 0 }}>
          {price}
        </h3>
        <s-text>/ {frequency}</s-text>
      </div>

      <div style={{ minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
          }}
        >
          {features.map((feature) => (
            <s-text color="subdued" key={feature}>
              {feature}
            </s-text>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <s-button {...button.props}>{button.content}</s-button>
      </div>
    </div>
  );
}
