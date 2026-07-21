import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import {
  data,
  useFetcher,
  useLoaderData,
  useLocation,
  useRevalidator,
} from "react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SettingsIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
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
import { AdminLanguageDropdown } from "../components/AdminLanguageDropdown";
import { useAdminI18n } from "../components/AdminI18nProvider";
import {
  SetupGuide,
  type SetupGuideItem,
} from "../components/SetupGuide";
import {
  getMainThemeAppEmbedStatus,
  peekMainThemeAppEmbedStatus,
} from "../services/themeAppEmbed.server";
import { ensureQuantityBreaksBlockInLiveTheme } from "../services/themeProductBlock.server";
import {
  ensureOffrefyStorefrontScriptTag,
  isOffrefyStorefrontScriptTagRecentlyEnsured,
} from "../services/ensureOffrefyStorefrontScriptTag.server";
import { pushStorefrontWidgetToShop } from "../services/refreshStorefrontWidget.server";
import { runAfterResponse } from "../services/deferredShopSync.server";
import { parseSessionScopes } from "../utils/shopPublishedLocales.server";
import {
  ADMIN_LANGUAGE_OPTIONS,
  adminLanguageCookieHeader,
  isAdminLanguageCode,
  normalizeAdminLanguage,
  type AdminLanguageCode,
} from "../utils/adminLanguage";
import {
  ensureAdminLanguageColumn,
  setAdminLanguage,
} from "../utils/adminLanguage.server";

export const meta: MetaFunction = () => [{ title: APP_DISPLAY_NAME }];

const SETUP_GUIDE_DISMISSED_KEY = "offrefy-setup-guide-dismissed";
/** Legacy key — manual checkbox overrides are no longer used. */
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
  /** True when embed status came from memory cache miss — client should soft-revalidate. */
  setupStatusStale: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const grantedScopes = parseSessionScopes(session.scope);
  const hasWriteThemes = grantedScopes.includes("write_themes");
  const hasWriteScriptTags = grantedScopes.includes("write_script_tags");

  // Fast path: DB only. Theme/ScriptTag Admin API work runs after the response.
  const [counts, lastSyncedAt, planCtx] = await Promise.all([
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
    import("../utils/shopPlan.server").then((m) =>
      m.resolveShopPlanContext(session.shop),
    ),
  ]);

  const campaignCount = Number(counts[0]?.campaignCount ?? 0);
  const activeCount = Number(counts[0]?.activeCount ?? 0);
  const maxActiveCampaigns = planCtx.capabilities.maxActiveCampaigns;

  const embedCached = peekMainThemeAppEmbedStatus(session.shop);
  const appEmbedEnabled = embedCached?.enabled ?? false;
  const appEmbedErrors = embedCached?.errors ?? [];
  const mainThemeId = mainThemeIdFromGid(embedCached?.themeId ?? null);
  const scriptTagOk = isOffrefyStorefrontScriptTagRecentlyEnsured(session.shop);
  const setupStatusStale = !embedCached;
  // ScriptTag alone is enough for the widget to show without App Embed.
  const storefrontReady = appEmbedEnabled || scriptTagOk;

  runAfterResponse(
    (async () => {
      try {
        const embed = await getMainThemeAppEmbedStatus(admin, session.shop);

        if (!embed.enabled && hasWriteThemes) {
          // Automatic settings_data write needs a Shopify themeFilesUpsert
          // exemption. Skip the failing API call — merchants enable via Theme editor.
          // (Deep link is on the home Setup Guide.)
        }

        if (hasWriteThemes) {
          await ensureQuantityBreaksBlockInLiveTheme(admin).catch((error) => {
            console.warn("[Offrefy] home quantity-breaks block", error);
          });
        }

        if (hasWriteScriptTags) {
          await ensureOffrefyStorefrontScriptTag(admin, session.shop).catch(
            (error) => {
              console.warn("[Offrefy] home storefront ScriptTag", error);
            },
          );
        }

        if (activeCount > 0) {
          await pushStorefrontWidgetToShop(admin, session.shop).catch(
            (error) => {
              console.warn("[Offrefy] home storefront widget refresh", error);
            },
          );
        }
      } catch (error) {
        console.warn("[Offrefy] home deferred setup", error);
      }
    })(),
  );

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
      setupStatusStale,
    } satisfies SetupStatus,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "saveAdminLanguage") {
    const raw = String(formData.get("adminLanguage") ?? "");
    if (!isAdminLanguageCode(raw)) {
      return { ok: false, intent, error: "Invalid admin language" };
    }
    await ensureAdminLanguageColumn();
    await setAdminLanguage(session.shop, raw);
    return data(
      {
        ok: true as const,
        intent,
        adminLanguage: raw,
        message: "Admin language saved",
      },
      {
        headers: {
          "Set-Cookie": adminLanguageCookieHeader(raw),
        },
      },
    );
  }

  return { ok: false, error: "Unknown action" };
};

function formatSyncedAt(
  iso: string | null,
  locale: string,
  notSyncedLabel: string,
): string {
  if (!iso) return notSyncedLabel;
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return notSyncedLabel;
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

export default function AppHomePage() {
  const { status } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const {
    t,
    localeKey,
    setAdminLanguage,
    adminLanguage: liveAdminLanguage,
  } = useAdminI18n();

  const offersHref = adminEmbeddedPath("/app/offers", search);
  const newOfferHref = adminEmbeddedPath("/app/volume-discount/new", search);
  const settingsHref = adminEmbeddedPath("/app/settings", search);
  const analyticsHref = adminEmbeddedPath("/app/analytics", search);

  const [adminLanguageDraft, setAdminLanguageDraft] =
    useState<AdminLanguageCode>(() =>
      normalizeAdminLanguage(liveAdminLanguage),
    );
  const savingAdminLanguage =
    fetcher.state !== "idle" &&
    String(fetcher.formData?.get("intent") ?? "") === "saveAdminLanguage";
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

  const [showGuide, setShowGuide] = useState(true);
  const [dismissedSetupBanner, setDismissedSetupBanner] = useState(false);

  useEffect(() => {
    setShowGuide(
      window.localStorage.getItem(SETUP_GUIDE_DISMISSED_KEY) !== "1",
    );
    // Drop legacy manual overrides so Done only reflects live status.
    window.localStorage.removeItem(SETUP_GUIDE_MANUAL_KEY);
  }, []);

  // After deferred Admin API fills the embed cache, soft-revalidate once.
  const softRefreshDone = useRef(false);
  useEffect(() => {
    if (!status.setupStatusStale || softRefreshDone.current) return;
    softRefreshDone.current = true;
    const id = window.setTimeout(() => {
      revalidator.revalidate();
    }, 2000);
    return () => window.clearTimeout(id);
  }, [status.setupStatusStale, revalidator]);

  useEffect(() => {
    setAdminLanguageDraft(liveAdminLanguage);
  }, [liveAdminLanguage]);

  useEffect(() => {
    if (!fetcher.data || !("intent" in fetcher.data)) return;
    if (fetcher.data.intent !== "saveAdminLanguage") return;
    if (!fetcher.data.ok) {
      shopify.toast.show(
        fetcher.data.error || t("home.adminLanguageSaveError"),
        { isError: true },
      );
      return;
    }
    if ("adminLanguage" in fetcher.data && fetcher.data.adminLanguage) {
      const next = normalizeAdminLanguage(fetcher.data.adminLanguage);
      setAdminLanguage(next);
      setAdminLanguageDraft(next);
    }
    shopify.toast.show(
      "message" in fetcher.data && fetcher.data.message
        ? String(fetcher.data.message)
        : t("home.adminLanguageSaved"),
    );
  }, [fetcher.data, setAdminLanguage, shopify, t]);

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

  const enableWidget = useCallback(() => {
    // themeFilesUpsert needs a Shopify exemption most apps don't have.
    // Deep-link into Theme editor → App embeds with Offrefy pre-selected instead.
    window.open(themeEmbedHref, "_blank", "noopener,noreferrer");
  }, [themeEmbedHref]);

  const onAdminLanguageSelect = useCallback(
    (value: string) => {
      const next = normalizeAdminLanguage(value);
      setAdminLanguageDraft(next);
      // Apply UI language immediately; Save persists to the shop.
      setAdminLanguage(next);
    },
    [setAdminLanguage],
  );

  const saveAdminLanguagePreference = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "saveAdminLanguage");
    fd.set("adminLanguage", adminLanguageDraft);
    fetcher.submit(fd, { method: "post" });
  }, [adminLanguageDraft, fetcher]);

  const setupItems = useMemo((): SetupGuideItem[] => {
    // Done only when live status is true — never from manual checkbox toggles.
    const isDone = (id: keyof typeof statusById) => Boolean(statusById[id]);

    const limitSuffix =
      status.maxActiveCampaigns == null
        ? ""
        : t("home.planLimit", { max: status.maxActiveCampaigns });

    return [
      {
        id: "enable-widget",
        title: t("home.stepEnableEmbedTitle"),
        description: t("home.stepEnableEmbedDesc"),
        complete: isDone("enable-widget"),
        image: {
          url: "https://cdn.shopify.com/shopifycloud/shopify/assets/admin/home/onboarding/shop_pay_task-70830ae12d3f01fed1da23e607dc58bc726325144c29f96c949baca598ee3ef6.svg",
          alt: t("home.stepEnableEmbedAlt"),
        },
        primaryButton: embedReady
          ? {
              content: t("home.themeEditor"),
              props: { url: themeEmbedHref, external: true },
            }
          : {
              content: t("home.bannerEnableEmbed"),
              props: {
                onClick: enableWidget,
              },
            },
        secondaryButton: undefined,
      },
      {
        id: "add-block",
        title: t("home.stepAddBlockTitle"),
        description: t("home.stepAddBlockDesc"),
        complete: isDone("add-block"),
        image: {
          url: "https://cdn.shopify.com/shopifycloud/shopify/assets/admin/home/onboarding/detail-images/home-onboard-share-store-b265242552d9ed38399455a5e4472c147e421cb43d72a0db26d2943b55bdb307.svg",
          alt: t("home.stepAddBlockAlt"),
        },
        primaryButton: {
          content: t("home.themeEditor"),
          props: { url: themeBlockHref, external: true },
        },
      },
      {
        id: "create-offer",
        title: t("home.stepCreateOfferTitle"),
        description: t("home.stepCreateOfferDesc"),
        complete: isDone("create-offer"),
        image: {
          url: "https://cdn.shopify.com/shopifycloud/shopify/assets/admin/home/onboarding/shop_pay_task-70830ae12d3f01fed1da23e607dc58bc726325144c29f96c949baca598ee3ef6.svg",
          alt: t("home.stepCreateOfferAlt"),
        },
        primaryButton: {
          content: t("home.createOffer"),
          props: { url: newOfferHref },
        },
        secondaryButton: status.hasOffers
          ? {
              content: t("home.viewOffersCount", {
                count: status.campaignCount,
              }),
              props: { url: offersHref },
            }
          : undefined,
      },
      {
        id: "activate-offers",
        title: t("home.stepActivateTitle"),
        description: t("home.stepActivateDesc", {
          active: status.activeCount,
          limit: limitSuffix,
          total: status.campaignCount,
        }),
        complete: isDone("activate-offers"),
        primaryButton: status.hasOffers
          ? {
              content: t("home.viewOffers"),
              props: { url: offersHref },
            }
          : {
              content: t("home.createOffer"),
              props: { url: newOfferHref },
            },
      },
      {
        id: "sync-storefront",
        title: t("home.stepSyncTitle"),
        description: t("home.stepSyncDesc", {
          synced: formatSyncedAt(
            status.lastSyncedAt,
            localeKey,
            t("home.notSyncedYet"),
          ),
        }),
        complete: isDone("sync-storefront"),
        primaryButton: {
          content: t("home.settings"),
          props: { url: settingsHref },
        },
      },
    ];
  }, [
    embedReady,
    enableWidget,
    localeKey,
    newOfferHref,
    offersHref,
    settingsHref,
    status.activeCount,
    status.campaignCount,
    status.maxActiveCampaigns,
    status.hasOffers,
    status.lastSyncedAt,
    statusById,
    t,
    themeBlockHref,
    themeEmbedHref,
  ]);

  const languageOptions = useMemo(
    () =>
      ADMIN_LANGUAGE_OPTIONS.map((opt) => ({
        value: opt.value,
        label:
          opt.value === "auto"
            ? t("lang.auto")
            : t(`lang.${opt.value}` as Parameters<typeof t>[0]),
      })),
    [t],
  );

  return (
    <Page
      title={APP_DISPLAY_NAME}
      subtitle={t("home.subtitle")}
      compactTitle
      primaryAction={{
        content: t("home.createOffer"),
        url: newOfferHref,
      }}
      secondaryActions={[
        {
          content: t("home.settings"),
          url: settingsHref,
          icon: SettingsIcon,
        },
      ]}
    >
      <BlockStack gap="500">
        {!setupComplete && showGuide && !dismissedSetupBanner ? (
          <Banner
            tone="info"
            title={t("home.bannerCompleteSetupTitle")}
            onDismiss={() => setDismissedSetupBanner(true)}
          >
            <p>{t("home.bannerCompleteSetupBody")}</p>
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {showGuide ? (
                <SetupGuide
                  onDismiss={dismissGuide}
                  items={setupItems}
                  title={t("home.setupGuideTitle")}
                  description={t("home.setupGuideDescription")}
                />
              ) : (
                <Card>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodyMd">
                      {t("home.setupDismissed")}
                    </Text>
                    <Button onClick={restoreGuide}>
                      {t("home.showSetupGuide")}
                    </Button>
                  </InlineStack>
                </Card>
              )}

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {t("home.quickLinks")}
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Button url={offersHref} size="slim">
                      {t("home.offers")}
                    </Button>
                    <Button url={analyticsHref} size="slim">
                      {t("home.analytics")}
                    </Button>
                    <Button url={settingsHref} size="slim">
                      {t("home.settings")}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {t("home.adminLanguage")}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("home.adminLanguageHelp")}
                  </Text>
                  <AdminLanguageDropdown
                    label={t("common.language")}
                    options={languageOptions}
                    value={adminLanguageDraft}
                    onChange={onAdminLanguageSelect}
                  />
                  <InlineStack align="end">
                    <Button
                      variant="primary"
                      onClick={saveAdminLanguagePreference}
                      loading={savingAdminLanguage}
                      disabled={
                        adminLanguageDraft ===
                        normalizeAdminLanguage(liveAdminLanguage)
                      }
                    >
                      {t("common.save")}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    {t("home.details")}
                  </Text>
                  <BlockStack gap="300">
                    <DetailRow label={t("home.shop")}>{status.shop}</DetailRow>
                    <DetailRow label={t("home.appEmbed")}>
                      {embedReady ? t("common.on") : t("common.off")}
                    </DetailRow>
                    <DetailRow label={t("home.storefrontWidget")}>
                      {status.storefrontReady
                        ? embedReady
                          ? t("home.widgetReadyEmbed")
                          : t("home.widgetReadyScript")
                        : t("home.widgetNeedsSetup")}
                    </DetailRow>
                    <DetailRow label={t("home.extension")}>
                      Offrefy — Storefront
                    </DetailRow>
                    <DetailRow label={t("home.blocks")}>
                      {t("home.blocksValue")}
                    </DetailRow>
                  </BlockStack>
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
