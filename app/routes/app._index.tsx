import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import {
  data,
  useFetcher,
  useLoaderData,
  useLocation,
  useRevalidator,
} from "react-router";
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
  Divider,
} from "@shopify/polaris";
import { SettingsIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { APP_DISPLAY_NAME } from "../branding";
import { prisma } from "../db.server";
import { authenticate } from "../shopify.server";
import { resolveShopLastSyncedAt, touchShopLastSyncedAt } from "../utils/shopSyncState.server";
import {
  adminEmbeddedPath,
  adminEmbeddedPathWithQuery,
} from "../utils/adminEmbeddedPath";
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
  invalidateThemeAppEmbedStatusCache,
  peekMainThemeAppEmbedStatus,
} from "../services/themeAppEmbed.server";
import {
  getQuantityBreaksBlockStatus,
  invalidateQuantityBreaksBlockStatusCache,
  isQuantityBreaksBlockInLiveTheme,
  peekQuantityBreaksBlockInLiveTheme,
} from "../services/themeProductBlock.server";
import {
  ensureOffrefyStorefrontScriptTag,
} from "../services/ensureOffrefyStorefrontScriptTag.server";
import { pushStorefrontWidgetToShop, refreshStorefrontWidgetForShop } from "../services/refreshStorefrontWidget.server";
import { runAfterResponse } from "../services/deferredShopSync.server";
import { syncVolumeDiscountShop } from "../services/volumeDiscountFunctionSync.server";
import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
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
  apiKey: string;
  campaignCount: number;
  activeCount: number;
  maxActiveCampaigns: number | null;
  appEmbedEnabled: boolean;
  /** Quantity breaks block present on live product template (manual Add block). */
  productBlockPresent: boolean;
  scriptTagOk: boolean;
  storefrontReady: boolean;
  appEmbedErrors: string[];
  needsWriteThemes: boolean;
  /** True when embed status came from memory cache miss — client should soft-revalidate. */
  setupStatusStale: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const forceSetupRefresh = url.searchParams.get("setupRefresh") === "1";

  const grantedScopes = parseSessionScopes(session.scope);
  const hasWriteThemes = grantedScopes.includes("write_themes");
  const hasWriteScriptTags = grantedScopes.includes("write_script_tags");

  // Fast path: DB only. Theme / legacy ScriptTag cleanup runs after the response.
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

  if (forceSetupRefresh) {
    invalidateThemeAppEmbedStatusCache(session.shop);
    invalidateQuantityBreaksBlockStatusCache(session.shop);
  }

  const embedCached = forceSetupRefresh
    ? null
    : peekMainThemeAppEmbedStatus(session.shop);
  const blockCached = forceSetupRefresh
    ? null
    : peekQuantityBreaksBlockInLiveTheme(session.shop);
  let appEmbedEnabled = embedCached?.enabled ?? false;
  let appEmbedErrors = embedCached?.errors ?? [];
  let mainThemeId = mainThemeIdFromGid(embedCached?.themeId ?? null);
  let productBlockPresent = blockCached ?? false;
  let setupStatusStale = !embedCached || blockCached === null;

  // Live Setup Guide: when forced (tab focus) or cache miss, fetch theme status now.
  if (forceSetupRefresh || !embedCached || blockCached === null) {
    try {
      const [embed, blockPresent] = await Promise.all([
        getMainThemeAppEmbedStatus(admin, session.shop, {
          force: true,
        }),
        isQuantityBreaksBlockInLiveTheme(admin, session.shop, {
          force: true,
        }),
      ]);
      appEmbedEnabled = embed.enabled;
      appEmbedErrors = embed.errors;
      mainThemeId = mainThemeIdFromGid(embed.themeId) ?? mainThemeId;
      productBlockPresent = blockPresent;
      setupStatusStale = false;
    } catch (error) {
      console.warn("[Offrefy] home setup status", error);
      setupStatusStale = true;
    }
  }

  const scriptTagOk = false;
  // Widget JS loads only from Theme App Embed (Shopify CDN after deploy).
  const storefrontReady = appEmbedEnabled;

  runAfterResponse(
    (async () => {
      try {
        if (!forceSetupRefresh) {
          await Promise.all([
            getMainThemeAppEmbedStatus(admin, session.shop),
            isQuantityBreaksBlockInLiveTheme(admin, session.shop),
          ]);
        }

        if (hasWriteScriptTags) {
          await ensureOffrefyStorefrontScriptTag(admin, session.shop).catch(
            (error) => {
              console.warn("[Offrefy] home storefront ScriptTag cleanup", error);
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
      // eslint-disable-next-line no-undef
      apiKey: process.env.SHOPIFY_API_KEY || "",
      campaignCount,
      activeCount,
      maxActiveCampaigns,
      appEmbedEnabled,
      productBlockPresent,
      scriptTagOk,
      storefrontReady,
      appEmbedErrors,
      needsWriteThemes: !hasWriteThemes,
      setupStatusStale,
    } satisfies SetupStatus,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "refreshSetupStatus") {
    invalidateThemeAppEmbedStatusCache(session.shop);
    invalidateQuantityBreaksBlockStatusCache(session.shop);

    const checkOnce = async () => {
      const [embed, block] = await Promise.all([
        getMainThemeAppEmbedStatus(admin, session.shop, { force: true }),
        getQuantityBreaksBlockStatus(admin, session.shop, { force: true }),
      ]);
      return { embed, block };
    };

    let { embed, block } = await checkOnce();
    // Theme editor saves can lag briefly behind Admin API — retry once.
    if (!embed.enabled || !block.present) {
      await new Promise((r) => setTimeout(r, 900));
      invalidateThemeAppEmbedStatusCache(session.shop);
      invalidateQuantityBreaksBlockStatusCache(session.shop);
      ({ embed, block } = await checkOnce());
    }

    return {
      ok: true as const,
      intent,
      appEmbedEnabled: embed.enabled,
      productBlockPresent: block.present,
      checkedFiles: block.checkedFiles,
      blockErrors: block.errors,
      embedErrors: embed.errors,
    };
  }

  if (intent === "syncStorefront") {
    try {
      const activeCount = await prisma.volumeDiscountCampaign.count({
        where: { shop: session.shop, status: "active" },
      });
      const { errors, discountIds } = await syncVolumeDiscountShop(
        admin,
        session.shop,
        { purgeLegacy: true, force: true },
      );
      if (errors.length) {
        return {
          ok: false as const,
          intent,
          error: errors.join(", "),
        };
      }
      if (activeCount > 0 && discountIds.length === 0) {
        return {
          ok: false as const,
          intent,
          error:
            "Active offers exist but Shopify did not create the automatic discount. Deploy the Offrefy function extension, then sync again.",
        };
      }

      invalidateMemoryCachePrefix(`widget:${session.shop}:`);
      invalidateMemoryCachePrefix(`cart-rules:${session.shop}:`);
      await refreshStorefrontWidgetForShop(admin, session.shop);

      const syncedAt = new Date();
      await touchShopLastSyncedAt(session.shop, syncedAt);
      return {
        ok: true as const,
        intent,
        lastSyncedAt: syncedAt.toISOString(),
      };
    } catch (e) {
      return {
        ok: false as const,
        intent,
        error: e instanceof Error ? e.message : "Sync failed",
      };
    }
  }

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
    return new Date(iso).toLocaleString(locale || undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return notSyncedLabel;
  }
}

export default function AppHomePage() {
  const { status } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const fetcher = useFetcher<typeof action>();
  const setupFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const {
    t,
    localeKey,
    setAdminLanguage,
    adminLanguage: liveAdminLanguage,
  } = useAdminI18n();

  const offersHref = adminEmbeddedPath("/app/offers", search);
  /** Opens Offers → Select offer type (not the editor directly). */
  const newOfferHref = adminEmbeddedPathWithQuery("/app/offers", search, {
    selectType: "1",
  });
  const settingsHref = adminEmbeddedPath("/app/settings", search);
  const analyticsHref = adminEmbeddedPath("/app/analytics", search);

  const [adminLanguageDraft, setAdminLanguageDraft] =
    useState<AdminLanguageCode>(() =>
      normalizeAdminLanguage(liveAdminLanguage),
    );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    status.lastSyncedAt,
  );
  useEffect(() => {
    setLastSyncedAt(status.lastSyncedAt);
  }, [status.lastSyncedAt]);

  const savingAdminLanguage =
    fetcher.state !== "idle" &&
    String(fetcher.formData?.get("intent") ?? "") === "saveAdminLanguage";
  const syncingStorefront =
    fetcher.state !== "idle" &&
    String(fetcher.formData?.get("intent") ?? "") === "syncStorefront";
  const themeEmbedHref = themeAppEmbedEditorUrl(
    status.shop,
    status.apiKey,
    status.mainThemeId,
  );
  const themeBlockHref = themeAppBlockEditorUrl(status.shop, status.apiKey, {
    themeId: status.mainThemeId,
    previewPath: status.productPreviewPath,
  });

  // Checklist Done only after merchant finishes that step (real app embed / block).
  // Refresh action returns live theme status immediately (don't wait on loader race).
  const [liveEmbed, setLiveEmbed] = useState<boolean | null>(null);
  const [liveBlock, setLiveBlock] = useState<boolean | null>(null);

  const embedReady = liveEmbed ?? status.appEmbedEnabled;
  const blockReady = liveBlock ?? status.productBlockPresent;
  const hasSynced = Boolean(lastSyncedAt);
  const setupComplete =
    embedReady &&
    blockReady &&
    status.hasOffers &&
    status.hasActiveOffers &&
    hasSynced;

  const [showGuide, setShowGuide] = useState(true);
  const [dismissedSetupBanner, setDismissedSetupBanner] = useState(false);
  const setupRefreshing = setupFetcher.state !== "idle";
  const pendingSetupRefresh = useRef(false);
  const lastSetupRefreshData = useRef<unknown>(null);

  useEffect(() => {
    setShowGuide(
      window.localStorage.getItem(SETUP_GUIDE_DISMISSED_KEY) !== "1",
    );
    // Drop legacy manual overrides so Done only reflects live status.
    window.localStorage.removeItem(SETUP_GUIDE_MANUAL_KEY);
  }, []);

  const requestSetupRefresh = useCallback(() => {
    // Dedicated fetcher — never blocked by language/sync or revalidator.
    // If a poll is in flight, queue one more refresh after it settles.
    if (setupFetcher.state !== "idle") {
      pendingSetupRefresh.current = true;
      return;
    }
    pendingSetupRefresh.current = false;
    const fd = new FormData();
    fd.set("intent", "refreshSetupStatus");
    setupFetcher.submit(fd, { method: "post" });
  }, [setupFetcher]);

  // Flush queued reload after an in-flight setup check finishes.
  useEffect(() => {
    if (setupFetcher.state !== "idle" || !pendingSetupRefresh.current) return;
    pendingSetupRefresh.current = false;
    const fd = new FormData();
    fd.set("intent", "refreshSetupStatus");
    setupFetcher.submit(fd, { method: "post" });
  }, [setupFetcher, setupFetcher.state]);

  // After deferred Admin API fills the embed cache, soft-check once.
  const softRefreshDone = useRef(false);
  useEffect(() => {
    if (!status.setupStatusStale || softRefreshDone.current) return;
    softRefreshDone.current = true;
    const id = window.setTimeout(() => {
      requestSetupRefresh();
    }, 1200);
    return () => window.clearTimeout(id);
  }, [status.setupStatusStale, requestSetupRefresh]);

  // Live update: when merchant returns from Theme editor (or periodically).
  useEffect(() => {
    if (setupComplete) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        requestSetupRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        requestSetupRefresh();
      }
    }, 15_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(pollId);
    };
  }, [setupComplete, requestSetupRefresh]);

  useEffect(() => {
    if (!setupFetcher.data || !("intent" in setupFetcher.data)) return;
    if (setupFetcher.state !== "idle") return;
    if (setupFetcher.data.intent !== "refreshSetupStatus") return;
    // Avoid re-applying the same response (e.g. effect re-run).
    if (lastSetupRefreshData.current === setupFetcher.data) return;
    lastSetupRefreshData.current = setupFetcher.data;
    if (!setupFetcher.data.ok) {
      shopify.toast.show(
        "error" in setupFetcher.data && setupFetcher.data.error
          ? String(setupFetcher.data.error)
          : t("common.unknownError"),
        { isError: true },
      );
      return;
    }
    if ("appEmbedEnabled" in setupFetcher.data) {
      setLiveEmbed(Boolean(setupFetcher.data.appEmbedEnabled));
    }
    if ("productBlockPresent" in setupFetcher.data) {
      setLiveBlock(Boolean(setupFetcher.data.productBlockPresent));
    }
    revalidator.revalidate();
  }, [setupFetcher.data, setupFetcher.state, revalidator, shopify, t]);

  // Drop local overrides only when loader confirms the same value.
  useEffect(() => {
    if (liveEmbed != null && status.appEmbedEnabled === liveEmbed) {
      setLiveEmbed(null);
    }
  }, [status.appEmbedEnabled, liveEmbed]);

  useEffect(() => {
    if (liveBlock != null && status.productBlockPresent === liveBlock) {
      setLiveBlock(null);
    }
  }, [status.productBlockPresent, liveBlock]);

  useEffect(() => {
    if (!fetcher.data || !("intent" in fetcher.data)) return;
    if (fetcher.data.intent === "syncStorefront") {
      if (!fetcher.data.ok) {
        shopify.toast.show(
          fetcher.data.error || t("settings.syncFailed"),
          { isError: true },
        );
        return;
      }
      if ("lastSyncedAt" in fetcher.data && fetcher.data.lastSyncedAt) {
        setLastSyncedAt(fetcher.data.lastSyncedAt);
      }
      shopify.toast.show(t("home.syncSuccess"));
      revalidator.revalidate();
      return;
    }
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
  }, [fetcher.data, setAdminLanguage, shopify, t, revalidator]);

  const syncStorefront = useCallback(() => {
    if (fetcher.state !== "idle") return;
    const fd = new FormData();
    fd.set("intent", "syncStorefront");
    fetcher.submit(fd, { method: "post" });
  }, [fetcher]);

  useEffect(() => {
    setAdminLanguageDraft(liveAdminLanguage);
  }, [liveAdminLanguage]);

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
        "add-block": blockReady,
        "create-offer": status.hasOffers,
        "activate-offers": status.hasActiveOffers,
        "sync-storefront": hasSynced,
      }) as const,
    [blockReady, embedReady, hasSynced, status.hasActiveOffers, status.hasOffers],
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
            lastSyncedAt,
            localeKey,
            t("home.notSyncedYet"),
          ),
        }),
        complete: isDone("sync-storefront"),
        primaryButton: {
          content: t("settings.syncNow"),
          props: {
            onClick: syncStorefront,
            loading: syncingStorefront,
            disabled: syncingStorefront,
          },
        },
      },
    ];
  }, [
    embedReady,
    enableWidget,
    lastSyncedAt,
    localeKey,
    newOfferHref,
    offersHref,
    status.activeCount,
    status.campaignCount,
    status.maxActiveCampaigns,
    status.hasOffers,
    statusById,
    syncStorefront,
    syncingStorefront,
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
                  onRefresh={requestSetupRefresh}
                  refreshing={setupRefreshing}
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
                    {t("settings.manualActions")}
                  </Text>
                  <Text as="p" tone="subdued">
                    {t("settings.manualActionsHelp")}
                  </Text>
                  <Divider />
                  {fetcher.data &&
                  "intent" in fetcher.data &&
                  fetcher.data.intent === "syncStorefront" &&
                  !fetcher.data.ok ? (
                    <Banner title={t("settings.syncFailed")} tone="critical">
                      <p>
                        {"error" in fetcher.data && fetcher.data.error
                          ? String(fetcher.data.error)
                          : t("common.unknownError")}
                      </p>
                    </Banner>
                  ) : null}
                  <InlineStack align="space-between" blockAlign="center">
                    <Button
                      onClick={syncStorefront}
                      loading={syncingStorefront}
                      variant="primary"
                    >
                      {t("settings.syncNow")}
                    </Button>
                    <BlockStack gap="050">
                      <Text
                        as="p"
                        variant="bodyMd"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        {t("settings.lastSynced")}
                      </Text>
                      <Text
                        as="p"
                        variant="bodyMd"
                        tone={lastSyncedAt ? "success" : "subdued"}
                      >
                        {lastSyncedAt
                          ? formatSyncedAt(
                              lastSyncedAt,
                              localeKey,
                              t("settings.neverSynced"),
                            )
                          : t("settings.neverSynced")}
                      </Text>
                    </BlockStack>
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
