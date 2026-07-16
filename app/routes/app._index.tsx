import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useFetcher, useLoaderData, useLocation } from "react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@shopify/polaris";
import {
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
  SetupGuide,
  type SetupGuideItem,
} from "../components/SetupGuide";
import {
  ensureThemeAppEmbedEnabled,
  getMainThemeAppEmbedStatus,
  invalidateThemeAppEmbedStatusCache,
} from "../services/themeAppEmbed.server";
import { ensureQuantityBreaksBlockInLiveTheme } from "../services/themeProductBlock.server";
import { ensureOffrefyStorefrontScriptTag } from "../services/ensureOffrefyStorefrontScriptTag.server";
import { pushStorefrontWidgetToShop } from "../services/refreshStorefrontWidget.server";
import { parseSessionScopes } from "../utils/shopPublishedLocales.server";

export const meta: MetaFunction = () => [{ title: APP_DISPLAY_NAME }];

const SETUP_GUIDE_DISMISSED_KEY = "offrefy-setup-guide-dismissed";
const SETUP_GUIDE_MANUAL_KEY = "offrefy-setup-guide-manual";

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
  maxActiveCampaigns: number | null;
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

  const [counts, lastSyncedAt, embedBefore, planCtx] = await Promise.all([
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
    getMainThemeAppEmbedStatus(admin, session.shop),
    import("../utils/shopPlan.server").then((m) =>
      m.resolveShopPlanContext(session.shop),
    ),
  ]);

  const maxActiveCampaigns = planCtx.capabilities.maxActiveCampaigns;

  let appEmbedEnabled = embedBefore.enabled;
  let appEmbedErrors = embedBefore.errors;
  let mainThemeId = mainThemeIdFromGid(embedBefore.themeId);
  let scriptTagOk = false;

  // Auto-enable when we already have write_themes (e.g. after merchant re-approved).
  const scriptTagPromise = hasWriteScriptTags
    ? ensureOffrefyStorefrontScriptTag(admin, session.shop)
    : Promise.resolve({ ok: false as const, errors: [] as string[] });

  if (!appEmbedEnabled && hasWriteThemes) {
    const enabled = await ensureThemeAppEmbedEnabled(admin);
    if (enabled.ok) {
      appEmbedEnabled = true;
      appEmbedErrors = [];
      invalidateThemeAppEmbedStatusCache(session.shop);
      /* Trust enable mutation — skip a second settings_data.json download. */
    } else {
      appEmbedErrors = enabled.errors;
      const embedAfter = await getMainThemeAppEmbedStatus(admin);
      appEmbedEnabled = embedAfter.enabled || appEmbedEnabled;
      mainThemeId = mainThemeIdFromGid(embedAfter.themeId) ?? mainThemeId;
      if (embedAfter.errors.length && !appEmbedEnabled) {
        appEmbedErrors = [...new Set([...appEmbedErrors, ...embedAfter.errors])];
      }
    }
  }

  if (hasWriteThemes) {
    await ensureQuantityBreaksBlockInLiveTheme(admin).catch((error) => {
      console.warn("[Offrefy] home quantity-breaks block", error);
    });
  }

  if (hasWriteScriptTags) {
    const tag = await scriptTagPromise;
    scriptTagOk = tag.ok;
    if (!tag.ok) {
      appEmbedErrors = [...new Set([...appEmbedErrors, ...tag.errors])];
    }
  }

  const campaignCount = Number(counts[0]?.campaignCount ?? 0);
  const activeCount = Number(counts[0]?.activeCount ?? 0);

  if (activeCount > 0) {
    void pushStorefrontWidgetToShop(admin, session.shop).catch((error) => {
      console.warn("[Offrefy] home storefront widget refresh", error);
    });
  }

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
      maxActiveCampaigns,
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

function readManualComplete(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SETUP_GUIDE_MANUAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeManualComplete(value: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETUP_GUIDE_MANUAL_KEY, JSON.stringify(value));
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

  // Checklist Done only after merchant finishes that step (real app embed).
  // Script-tag fallback can keep the widget live but must not fake Done.
  const embedReady = status.appEmbedEnabled;
  const hasSynced = Boolean(status.lastSyncedAt);
  const setupComplete =
    embedReady &&
    status.hasOffers &&
    status.hasActiveOffers &&
    hasSynced;
  const enabling =
    fetcher.state !== "idle" &&
    String(fetcher.formData?.get("intent") ?? "") === "enableAppEmbed";

  const [showGuide, setShowGuide] = useState(true);
  const [manualComplete, setManualComplete] = useState<Record<string, boolean>>(
    {},
  );
  const [dismissedSetupBanner, setDismissedSetupBanner] = useState(false);
  const [dismissedSuccessBanner, setDismissedSuccessBanner] = useState(false);
  const [dismissedErrorBanner, setDismissedErrorBanner] = useState(false);
  const [dismissedWarningBanner, setDismissedWarningBanner] = useState(false);

  useEffect(() => {
    setShowGuide(
      window.localStorage.getItem(SETUP_GUIDE_DISMISSED_KEY) !== "1",
    );
    setManualComplete(readManualComplete());
  }, []);

  useEffect(() => {
    setDismissedSuccessBanner(false);
    setDismissedErrorBanner(false);
  }, [fetcher.data]);

  const dismissGuide = useCallback(() => {
    window.localStorage.setItem(SETUP_GUIDE_DISMISSED_KEY, "1");
    setShowGuide(false);
  }, []);

  const restoreGuide = useCallback(() => {
    window.localStorage.removeItem(SETUP_GUIDE_DISMISSED_KEY);
    setShowGuide(true);
  }, []);

  const statusById = useMemo(
    () =>
      ({
        "enable-widget": embedReady,
        "add-block": embedReady,
        "create-offer": status.hasOffers,
        "activate-offers": status.hasActiveOffers,
        "sync-storefront": hasSynced,
      }) as const,
    [embedReady, hasSynced, status.hasActiveOffers, status.hasOffers],
  );

  const onStepComplete = useCallback(
    async (id: SetupGuideItem["id"]) => {
      const key = String(id);
      await new Promise((resolve) => setTimeout(resolve, 250));
      setManualComplete((prev) => {
        // Status-driven steps stay complete; only toggle soft overrides.
        if (statusById[key as keyof typeof statusById]) return prev;
        const next = { ...prev };
        if (next[key]) delete next[key];
        else next[key] = true;
        writeManualComplete(next);
        return next;
      });
    },
    [statusById],
  );

  const enableWidget = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "enableAppEmbed");
    fetcher.submit(fd, { method: "post" });
  }, [fetcher]);

  const setupItems = useMemo((): SetupGuideItem[] => {
    const isDone = (id: keyof typeof statusById) =>
      Boolean(statusById[id] || manualComplete[id]);

    return [
      {
        id: "enable-widget",
        title: "Enable app embed",
        description:
          "Theme settings → App embeds → turn on Offrefy (global), or use Enable app embed. Required for reliable quantity breaks on product pages.",
        complete: isDone("enable-widget"),
        image: {
          url: "https://cdn.shopify.com/shopifycloud/shopify/assets/admin/home/onboarding/shop_pay_task-70830ae12d3f01fed1da23e607dc58bc726325144c29f96c949baca598ee3ef6.svg",
          alt: "Illustration of enabling a storefront integration",
        },
        primaryButton: embedReady
          ? {
              content: "Theme editor",
              props: { url: themeEmbedHref, external: true },
            }
          : {
              content: enabling ? "Enabling…" : "Enable app embed",
              props: {
                onClick: enableWidget,
                loading: enabling,
              },
            },
        secondaryButton: embedReady
          ? undefined
          : {
              content: "Theme editor",
              props: { url: themeEmbedHref, external: true },
            },
      },
      {
        id: "add-block",
        title: "Add widget on product page",
        description:
          "Optional: Product template → Add block → Quantity breaks. The global embed already places the widget near Add to cart.",
        complete: isDone("add-block"),
        image: {
          url: "https://cdn.shopify.com/shopifycloud/shopify/assets/admin/home/onboarding/detail-images/home-onboard-share-store-b265242552d9ed38399455a5e4472c147e421cb43d72a0db26d2943b55bdb307.svg",
          alt: "Illustration of a product page layout",
        },
        primaryButton: {
          content: "Theme editor",
          props: { url: themeBlockHref, external: true },
        },
      },
      {
        id: "create-offer",
        title: "Create an offer",
        description:
          "Set tiers, products, and widget styling. Active offers sync as automatic discounts.",
        complete: isDone("create-offer"),
        image: {
          url: "https://cdn.shopify.com/shopifycloud/shopify/assets/admin/home/onboarding/shop_pay_task-70830ae12d3f01fed1da23e607dc58bc726325144c29f96c949baca598ee3ef6.svg",
          alt: "Illustration of creating a discount offer",
        },
        primaryButton: {
          content: "Create offer",
          props: { url: newOfferHref },
        },
        secondaryButton: status.hasOffers
          ? {
              content: `View offers (${status.campaignCount})`,
              props: { url: offersHref },
            }
          : undefined,
      },
      {
        id: "activate-offers",
        title: "Activate offers",
        description: `Only Active offers show on the storefront. Discount rules sync on save. Active: ${status.activeCount}${
          status.maxActiveCampaigns == null
            ? ""
            : ` / ${status.maxActiveCampaigns} (plan limit)`
        } (total offers: ${status.campaignCount})`,
        complete: isDone("activate-offers"),
        primaryButton: status.hasOffers
          ? {
              content: "View offers",
              props: { url: offersHref },
            }
          : {
              content: "Create offer",
              props: { url: newOfferHref },
            },
      },
      {
        id: "sync-storefront",
        title: "Sync storefront",
        description: `Last sync: ${formatSyncedAt(status.lastSyncedAt)}. Re-sync in Settings if the live widget looks outdated.`,
        complete: isDone("sync-storefront"),
        primaryButton: {
          content: "Settings",
          props: { url: settingsHref },
        },
      },
    ];
  }, [
    embedReady,
    enableWidget,
    enabling,
    manualComplete,
    newOfferHref,
    offersHref,
    settingsHref,
    status.activeCount,
    status.campaignCount,
    status.maxActiveCampaigns,
    status.hasOffers,
    status.lastSyncedAt,
    statusById,
    themeBlockHref,
    themeEmbedHref,
  ]);

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
        {!embedReady && !dismissedWarningBanner ? (
          <Banner
            tone="warning"
            title="App embed is off"
            onDismiss={() => setDismissedWarningBanner(true)}
            action={{
              content: enabling ? "Enabling…" : "Enable app embed",
              onAction: enableWidget,
              loading: enabling,
            }}
            secondaryAction={{
              content: "Open theme editor",
              url: themeEmbedHref,
            }}
          >
            <p>
              Turn on{" "}
              <Text as="span" fontWeight="semibold">
                Offrefy (global)
              </Text>{" "}
              under Theme settings → App embeds → Save, or click Enable app embed.
              {status.scriptTagOk
                ? " Script fallback can still show the widget until embed is on."
                : ""}
              {status.appEmbedErrors.length > 0
                ? ` (${status.appEmbedErrors[0]})`
                : ""}
            </p>
          </Banner>
        ) : !setupComplete && showGuide && !dismissedSetupBanner ? (
          <Banner
            tone="info"
            title="Complete setup"
            onDismiss={() => setDismissedSetupBanner(true)}
          >
            <p>
              Finish the steps below to show quantity breaks on product pages and
              apply discounts at checkout.
            </p>
          </Banner>
        ) : null}

        {fetcher.data &&
        "ok" in fetcher.data &&
        fetcher.data.ok &&
        !dismissedSuccessBanner ? (
          <Banner
            tone="success"
            title="App embed enabled"
            onDismiss={() => setDismissedSuccessBanner(true)}
          >
            <p>
              Offrefy (global) is on. Hard-refresh a product page
              (Ctrl+Shift+R) to see quantity breaks.
            </p>
          </Banner>
        ) : null}

        {fetcher.data &&
        "ok" in fetcher.data &&
        !fetcher.data.ok &&
        !dismissedErrorBanner ? (
          <Banner
            tone="critical"
            title="Could not enable app embed automatically"
            onDismiss={() => setDismissedErrorBanner(true)}
          >
            <p>
              {fetcher.data.error || "Unknown error"}. Use Theme editor → App
              embeds → turn on Offrefy (global) → Save.
            </p>
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {showGuide ? (
                <SetupGuide
                  onDismiss={dismissGuide}
                  onStepComplete={onStepComplete}
                  items={setupItems}
                  description="Five steps to go live with quantity breaks and checkout discounts."
                />
              ) : (
                <Card>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodyMd">
                      Setup guide dismissed.
                    </Text>
                    <Button onClick={restoreGuide}>Show setup guide</Button>
                  </InlineStack>
                </Card>
              )}
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
                      {embedReady ? "On" : "Off"}
                    </DetailRow>
                    <DetailRow label="Storefront widget">
                      {status.storefrontReady
                        ? embedReady
                          ? "Ready (app embed)"
                          : "Ready (script fallback)"
                        : "Needs setup"}
                    </DetailRow>
                    <DetailRow label="Extension">Offrefy — Storefront</DetailRow>
                    <DetailRow label="Blocks">
                      Quantity breaks · Offrefy (global)
                    </DetailRow>
                  </BlockStack>
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

              <ApprovefyPromoCard />
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
