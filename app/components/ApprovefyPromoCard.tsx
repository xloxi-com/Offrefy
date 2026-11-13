export const APPROVEFY_APP_STORE_URL = "https://apps.shopify.com/approvefy";

const APPROVEFY_ICON_URL = "/approvefy-icon.png";

/** Compact recommended-app tile — Polaris web, same App Store URL. */
export function ApprovefyPromoCard() {
  return (
    <s-stack direction="block" gap="base">
      <s-text color="subdued">Recommended app</s-text>
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-thumbnail size="small" src={APPROVEFY_ICON_URL} alt="Approvefy" />
        <s-stack direction="block" gap="none">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text type="strong">Approvefy</s-text>
            <s-badge tone="info">XLOXI</s-badge>
          </s-stack>
          <s-text color="subdued">B2B signup & approval</s-text>
        </s-stack>
      </s-stack>
      <s-paragraph color="subdued">
        Guest checkout guard, auto tagging, and manual approval. From $4.99/mo
        with a 7-day free trial.
      </s-paragraph>
      <s-button href={APPROVEFY_APP_STORE_URL} target="_blank">
        View on App Store
      </s-button>
    </s-stack>
  );
}
