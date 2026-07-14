import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import type { ReactNode } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Divider,
  Badge,
  Box,
  Icon,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  QuestionCircleIcon,
  ThemeEditIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { APP_DISPLAY_NAME } from "../branding";
import { prisma } from "../db.server";
import { authenticate } from "../shopify.server";
import { resolveShopLastSyncedAt } from "../utils/shopSyncState.server";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import {
  mainThemeIdFromGid,
  themeAppBlockEditorUrl,
  themeAppEmbedEditorUrl,
} from "../utils/themeEditorDeepLinks";
import { storefrontProductPreviewUrl } from "../utils/storefrontProductPreviewUrl.server";
import { fetchLiveThemeProductSectionId } from "../utils/themeProductSection.server";
import { ApprovefyPromoCard } from "../components/ApprovefyPromoCard";

export const meta: MetaFunction = () => [{ title: APP_DISPLAY_NAME }];

type SetupStatus = {
  hasOffers: boolean;
  hasActiveOffers: boolean;
  lastSyncedAt: string | null;
  shop: string;
  mainThemeId: string | null;
  productPreviewPath: string | null;
  productSectionId: string | null;
  apiKey: string;
  campaignCount: number;
  activeCount: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const [campaignCount, activeCount, mainThemeGid] =
    await Promise.all([
      prisma.volumeDiscountCampaign.count({ where: { shop: session.shop } }),
      prisma.volumeDiscountCampaign.count({
        where: { shop: session.shop, status: "active" },
      }),
      admin
        .graphql(
          `#graphql
          query OffrefyMainTheme {
            themes(first: 1, roles: [MAIN]) {
              nodes {
                id
              }
            }
          }`,
        )
        .then((res) => res.json())
        .then(
          (body: {
            data?: { themes?: { nodes?: Array<{ id?: string }> } };
          }) => body.data?.themes?.nodes?.[0]?.id ?? null,
        )
        .catch(() => null),
    ]);

  const mainThemeId = mainThemeIdFromGid(mainThemeGid);

  const [lastSyncedAt, productPreviewUrl, productSectionId] = await Promise.all([
    resolveShopLastSyncedAt(session.shop).then(
      (d) => d?.toISOString() ?? null,
    ),
    storefrontProductPreviewUrl(admin, session.shop),
    fetchLiveThemeProductSectionId(admin, mainThemeGid),
  ]);

  let productPreviewPath: string | null = null;
  if (productPreviewUrl) {
    try {
      productPreviewPath = new URL(productPreviewUrl).pathname;
    } catch {
      productPreviewPath = null;
    }
  }

  return {
    status: {
      hasOffers: campaignCount > 0,
      hasActiveOffers: activeCount > 0,
      lastSyncedAt,
      shop: session.shop,
      mainThemeId,
      productPreviewPath,
      productSectionId,
      // eslint-disable-next-line no-undef
      apiKey: process.env.SHOPIFY_API_KEY || "",
      campaignCount,
      activeCount,
    } satisfies SetupStatus,
  };
};

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "Not synced yet";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "Unknown";
  }
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="span" variant="bodySm">
        {children}
      </Text>
    </BlockStack>
  );
}

function StepRow({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <BlockStack gap="200">
      <InlineStack gap="200" blockAlign="start" wrap={false}>
        <Box>
          <Icon
            source={done ? CheckCircleIcon : QuestionCircleIcon}
            tone={done ? "success" : "subdued"}
          />
        </Box>
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingSm">
              {title}
            </Text>
            <Badge tone={done ? "success" : "attention"}>
              {done ? "Done" : "To do"}
            </Badge>
          </InlineStack>
          {children}
        </BlockStack>
      </InlineStack>
    </BlockStack>
  );
}

export default function AppHomePage() {
  const { status } = useLoaderData<typeof loader>();
  const { search } = useLocation();

  const offersHref = adminEmbeddedPath("/app/offers", search);
  const newOfferHref = adminEmbeddedPath("/app/volume-discount/new", search);
  const settingsHref = adminEmbeddedPath("/app/settings", search);
  const analyticsHref = adminEmbeddedPath("/app/analytics", search);
  const themeEmbedHref = themeAppEmbedEditorUrl(
    status.shop,
    status.apiKey,
    status.mainThemeId,
  );
  const themeBlockHref = themeAppBlockEditorUrl(status.shop, status.apiKey, {
    themeId: status.mainThemeId,
    previewPath: status.productPreviewPath,
    productSectionId: status.productSectionId,
  });

  const themeReady = status.hasActiveOffers && Boolean(status.lastSyncedAt);
  const setupComplete = status.hasActiveOffers && themeReady;

  return (
    <Page
      title={APP_DISPLAY_NAME}
      subtitle="Volume pricing for your storefront."
      compactTitle
      primaryAction={{
        content: "Create offer",
        url: newOfferHref,
      }}
      secondaryActions={[
        {
          content: "Theme editor",
          url: themeEmbedHref,
          target: "_blank",
          icon: ThemeEditIcon,
        },
        {
          content: "Settings",
          url: settingsHref,
          icon: SettingsIcon,
        },
      ]}
    >
      <BlockStack gap="500">
        {!setupComplete ? (
          <Banner tone="info" title="Complete setup">
            <p>
              Finish the steps below to show quantity breaks on product pages and
              apply discounts at checkout.
            </p>
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Setup
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Five steps to go live.
                  </Text>
                  <Divider />

                  <StepRow done={themeReady} title="1. Enable app embed">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Theme settings → App embeds → turn on{" "}
                      <Text as="span" fontWeight="semibold">
                        Offrefy (global)
                      </Text>
                      . Loads scripts on your storefront.
                    </Text>
                    <InlineStack gap="200" align="start">
                      <Button
                        url={themeEmbedHref}
                        external
                        icon={ThemeEditIcon}
                        size="slim"
                      >
                        Theme editor
                      </Button>
                    </InlineStack>
                  </StepRow>

                  <Divider />

                  <StepRow done={themeReady} title="2. Add widget on product page">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Opens Product template → Product information → Add block →
                      Apps →{" "}
                      <Text as="span" fontWeight="semibold">
                        Quantity breaks
                      </Text>{" "}
                      (below the product title).
                    </Text>
                    <InlineStack gap="200" align="start">
                      <Button
                        url={themeBlockHref}
                        external
                        icon={ThemeEditIcon}
                        size="slim"
                      >
                        Theme editor
                      </Button>
                    </InlineStack>
                  </StepRow>

                  <Divider />

                  <StepRow done={status.hasOffers} title="3. Create an offer">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Set tiers, products, and widget styling. Active offers sync
                      as automatic discounts.
                    </Text>
                    <InlineStack gap="200" align="start">
                      <Button url={newOfferHref} variant="primary" size="slim">
                        Create offer
                      </Button>
                      {status.hasOffers ? (
                        <Button url={offersHref} size="slim">
                          {`View offers (${status.campaignCount})`}
                        </Button>
                      ) : null}
                    </InlineStack>
                  </StepRow>

                  <Divider />

                  <StepRow done={status.hasActiveOffers} title="4. Activate offers">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Only{" "}
                      <Text as="span" fontWeight="semibold">
                        Active
                      </Text>{" "}
                      offers show on the storefront. Discount rules sync on save.
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Active: {status.activeCount} / {status.campaignCount}
                    </Text>
                  </StepRow>

                  <Divider />

                  <StepRow done={Boolean(status.lastSyncedAt)} title="5. Sync storefront">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Last sync: {formatSyncedAt(status.lastSyncedAt)}. Re-sync in
                      Settings if the live widget looks outdated.
                    </Text>
                    <InlineStack gap="200" align="start">
                      <Button url={settingsHref} icon={SettingsIcon} size="slim">
                        Settings
                      </Button>
                    </InlineStack>
                  </StepRow>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Quick links
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Button url={offersHref} size="slim">
                      Offers
                    </Button>
                    <Button url={analyticsHref} size="slim">
                      Analytics
                    </Button>
                    <Button url={settingsHref} size="slim">
                      Settings
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Details
                  </Text>
                  <BlockStack gap="300">
                    <DetailRow label="Shop">{status.shop}</DetailRow>
                    <DetailRow label="Extension">Offrefy — Storefront</DetailRow>
                    <DetailRow label="Blocks">
                      Quantity breaks · Offrefy (global)
                    </DetailRow>
                  </BlockStack>
                  <Divider />
                  <DetailRow label="Checkout">
                    Auto discount at cart & checkout
                  </DetailRow>
                  <Divider />
                  <DetailRow label="Access">
                    Discounts · Products · Locales
                  </DetailRow>
                </BlockStack>
              </Card>

              <ApprovefyPromoCard />
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
