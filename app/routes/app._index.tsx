import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useFetcher, useLoaderData, useLocation } from "react-router";
import type { ReactNode } from "react";
import { Prisma } from "@prisma/client";
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
  themeAppBlockEditorUrl,
  themeAppEmbedEditorUrl,
  mainThemeIdFromGid,
} from "../utils/themeEditorDeepLinks";
import { ApprovefyPromoCard } from "../components/ApprovefyPromoCard";
import {
  ensureThemeAppEmbedEnabled,
  getMainThemeAppEmbedStatus,
} from "../services/themeAppEmbed.server";
import { ensureOffrefyStorefrontScriptTag } from "../services/ensureOffrefyStorefrontScriptTag.server";
import { parseSessionScopes } from "../utils/shopPublishedLocales.server";

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
  appEmbedEnabled: boolean;
  scriptTagOk: boolean;
  storefrontReady: boolean;
  appEmbedErrors: string[];
  needsWriteThemes: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const grantedScopes = parseSessionScopes(session.scope);
  const hasWriteThemes = grantedScopes.includes("write_themes");
  const hasWriteScriptTags = grantedScopes.includes("write_script_tags");

  const [counts, lastSyncedAt, embedBefore] = await Promise.all([
    prisma.$queryRaw<Array<{ campaignCount: bigint; activeCount: bigint }>>(
      Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "campaignCount",
          COUNT(*) FILTER (WHERE c."status" = 'active')::bigint AS "activeCount"
        FROM "VolumeDiscountCampaign" c
        WHERE c."shop" = ${session.shop}
      `,
    ),
    resolveShopLastSyncedAt(session.shop),
    getMainThemeAppEmbedStatus(admin),
  ]);

  let appEmbedEnabled = embedBefore.enabled;
  let appEmbedErrors = embedBefore.errors;
  let mainThemeId = mainThemeIdFromGid(embedBefore.themeId);
  let scriptTagOk = false;

  // Auto-enable when we already have write_themes (e.g. after merchant re-approved).
  if (!appEmbedEnabled && hasWriteThemes) {
    const enabled = await ensureThemeAppEmbedEnabled(admin);
    if (enabled.ok) {
      appEmbedEnabled = true;
      appEmbedErrors = [];
    } else {
      appEmbedErrors = enabled.errors;
    }
    const embedAfter = await getMainThemeAppEmbedStatus(admin);
    appEmbedEnabled = embedAfter.enabled || appEmbedEnabled;
    mainThemeId = mainThemeIdFromGid(embedAfter.themeId) ?? mainThemeId;
    if (embedAfter.errors.length && !appEmbedEnabled) {
      appEmbedErrors = [...new Set([...appEmbedErrors, ...embedAfter.errors])];
    }
  }

  if (hasWriteScriptTags) {
    const tag = await ensureOffrefyStorefrontScriptTag(admin, session.shop);
    scriptTagOk = tag.ok;
    if (!tag.ok) {
      appEmbedErrors = [...new Set([...appEmbedErrors, ...tag.errors])];
    }
  }

  const campaignCount = Number(counts[0]?.campaignCount ?? 0);
  const activeCount = Number(counts[0]?.activeCount ?? 0);

  // ScriptTag alone is enough for the widget to show without App Embed.
  const storefrontReady = appEmbedEnabled || scriptTagOk;

  return {
    status: {
      hasOffers: campaignCount > 0,
      hasActiveOffers: activeCount > 0,
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      shop: session.shop,
      mainThemeId,
      productPreviewPath: null,
      productSectionId: null,
      // eslint-disable-next-line no-undef
      apiKey: process.env.SHOPIFY_API_KEY || "",
      campaignCount,
      activeCount,
      appEmbedEnabled,
      scriptTagOk,
      storefrontReady,
      appEmbedErrors,
      needsWriteThemes: !hasWriteThemes,
    } satisfies SetupStatus,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, scopes, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "enableAppEmbed") {
    const grantedScopes = parseSessionScopes(session.scope);
    if (!grantedScopes.includes("write_themes")) {
      await scopes.request(["write_themes", "write_script_tags", "read_script_tags"]);
    } else if (!grantedScopes.includes("write_script_tags")) {
      await scopes.request(["write_script_tags", "read_script_tags"]);
    }
    const result = await ensureThemeAppEmbedEnabled(admin);
    const tag = await ensureOffrefyStorefrontScriptTag(admin, session.shop);
    return {
      ok: result.ok || tag.ok,
      alreadyEnabled: result.alreadyEnabled,
      error:
        [...result.errors, ...tag.errors].filter(Boolean).join("; ") || null,
    };
  }

  return { ok: false, error: "Unknown action" };
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
  const fetcher = useFetcher<typeof action>();

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

  const themeReady = status.storefrontReady;
  const setupComplete = status.hasActiveOffers && themeReady;
  const enabling =
    fetcher.state !== "idle" &&
    String(fetcher.formData?.get("intent") ?? "") === "enableAppEmbed";

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
        {!status.storefrontReady ? (
          <Banner
            tone="warning"
            title="Product page widget is off"
            action={{
              content: enabling ? "Enabling…" : "Enable widget now",
              onAction: () => {
                const fd = new FormData();
                fd.set("intent", "enableAppEmbed");
                fetcher.submit(fd, { method: "post" });
              },
              loading: enabling,
            }}
            secondaryAction={{
              content: "Open theme editor",
              url: themeEmbedHref,
            }}
          >
            <p>
              Cart discounts can work without the storefront widget. Click Enable
              widget now (approves theme/script permissions), or turn on{" "}
              <Text as="span" fontWeight="semibold">
                Offrefy (global)
              </Text>{" "}
              under Theme settings → App embeds → Save.
              {status.appEmbedErrors.length > 0
                ? ` (${status.appEmbedErrors[0]})`
                : ""}
            </p>
          </Banner>
        ) : !setupComplete ? (
          <Banner tone="info" title="Complete setup">
            <p>
              Finish the steps below to show quantity breaks on product pages and
              apply discounts at checkout.
            </p>
          </Banner>
        ) : null}

        {fetcher.data && "ok" in fetcher.data && fetcher.data.ok ? (
          <Banner tone="success" title="Widget enabled">
            <p>
              App embed is on. Hard-refresh a product page (Ctrl+Shift+R) to see
              quantity breaks.
            </p>
          </Banner>
        ) : null}

        {fetcher.data && "ok" in fetcher.data && !fetcher.data.ok ? (
          <Banner tone="critical" title="Could not enable widget automatically">
            <p>
              {fetcher.data.error || "Unknown error"}. Use Theme editor → App
              embeds → turn on Offrefy (global) → Save.
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
                      {!themeReady ? (
                        <Button
                          size="slim"
                          variant="primary"
                          loading={enabling}
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("intent", "enableAppEmbed");
                            fetcher.submit(fd, { method: "post" });
                          }}
                        >
                          Enable widget now
                        </Button>
                      ) : null}
                    </InlineStack>
                  </StepRow>

                  <Divider />

                  <StepRow done={themeReady} title="2. Add widget on product page">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Optional: Product template → Add block →{" "}
                      <Text as="span" fontWeight="semibold">
                        Quantity breaks
                      </Text>
                      . The global embed already places the widget near Add to
                      cart.
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
                    <DetailRow label="App embed">
                      {status.appEmbedEnabled ? "On" : "Off"}
                    </DetailRow>
                    <DetailRow label="Script fallback">
                      {status.scriptTagOk ? "On" : "Off"}
                    </DetailRow>
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
                    Discounts · Products · Themes · Locales
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
