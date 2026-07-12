import {
  Box,
  Button,
  Card,
  InlineStack,
  BlockStack,
  Text,
  Badge,
} from "@shopify/polaris";

export const APPROVEFY_APP_STORE_URL = "https://apps.shopify.com/approvefy";

const APPROVEFY_ICON_URL = "/approvefy-icon.png";

/** Sidebar ad-style promo for Approvefy on the Offrefy setup home page. */
export function ApprovefyPromoCard() {
  return (
    <Card padding="0">
      <Box padding="400" background="bg-surface-secondary">
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" variant="bodySm" tone="subdued">
              Recommended app
            </Text>
            <Badge tone="info">XLOXI</Badge>
          </InlineStack>

          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <Box
              borderRadius="200"
              overflowX="hidden"
              overflowY="hidden"
              minWidth="44px"
              minHeight="44px"
            >
              <img
                src={APPROVEFY_ICON_URL}
                alt="Approvefy"
                width={44}
                height={44}
                style={{ display: "block", objectFit: "cover" }}
              />
            </Box>
            <BlockStack gap="050">
              <Text as="h3" variant="headingSm">
                Approvefy
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                B2B signup forms with approval workflows
              </Text>
            </BlockStack>
          </InlineStack>

          <Text as="p" variant="bodySm" tone="subdued">
            Guest checkout guard, auto tagging, and manual approval. From
            $4.99/mo with a 7-day free trial.
          </Text>

          <InlineStack align="start">
            <Button url={APPROVEFY_APP_STORE_URL} external size="slim">
              View on App Store
            </Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}
