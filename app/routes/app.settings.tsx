import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  FormLayout,
  TextField,
  Divider,
  Button,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { RefreshIcon, AutomationIcon } from "@shopify/polaris-icons";
import { ApprovefyPromoCard } from "../components/ApprovefyPromoCard";
import { AdminLanguageDropdown } from "../components/AdminLanguageDropdown";
import { useAdminI18n } from "../components/AdminI18nProvider";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { syncVolumeDiscountShop } from "../services/volumeDiscountFunctionSync.server";
import { refreshStorefrontWidgetForShop, pushStorefrontWidgetToShop } from "../services/refreshStorefrontWidget.server";
import { scheduleDueSyncForShopIfNeeded, applyShopCampaignScheduleTransitionsIfNeeded } from "../services/scheduledVolumeDiscountSync.server";
import { reconcileOrderAnalyticsForShop } from "../services/orderAnalyticsReconcile.server";
import { resolveShopPlanContext } from "../utils/shopPlan.server";
import { PlanUpgradeBanner } from "../components/PlanUpgradeBanner";
import { planLockedActionContent } from "../components/PlanUpgradeBadge";
import { runAfterResponse } from "../services/deferredShopSync.server";
import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
import {
  readShopLastSyncedAt,
  resolveShopLastSyncedAt,
  touchShopLastSyncedAt,
} from "../utils/shopSyncState.server";
import {
  FALLBACK_SHOP_LANGUAGES,
  fetchShopPublishedLocales,
  parseSessionScopes,
} from "../utils/shopPublishedLocales.server";
import {
  buildStorefrontTranslationsForLanguages,
  translationPresetForLanguage,
  type StorefrontTranslationFields,
  type StorefrontTranslationsMap,
} from "../utils/storefrontTranslations";
import {
  parseStoredStorefrontTranslations,
  persistStorefrontTranslations,
  readStorefrontSettingsRow,
  syncStorefrontTranslationsWithShopLanguages,
} from "../utils/storefrontTranslations.server";
import {
  autoTranslateStorefrontFields,
  resolveEnglishSourceForAutoTranslate,
} from "../utils/storefrontAutoTranslate.server";
import {
  ADMIN_LANGUAGE_OPTIONS,
  adminLanguageCookieHeader,
  isAdminLanguageCode,
  normalizeAdminLanguage,
  type AdminLanguageCode,
} from "../utils/adminLanguage";
import {
  ensureAdminLanguageColumn,
  resolveAdminLanguage,
  setAdminLanguage,
} from "../utils/adminLanguage.server";

type TranslationFields = StorefrontTranslationFields;
type TranslationsMap = StorefrontTranslationsMap;

type SettingsData = {
  syncInterval: string;
  lastSynced: string | null;
  translations: TranslationsMap;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin, scopes } = await authenticate.admin(request);
  const grantedScopes = parseSessionScopes(session.scope);
  let hasLocaleScope =
    grantedScopes.includes("read_locales") ||
    grantedScopes.includes("read_markets_home");

  // Session scopes can lag after install; force Shopify scope approval when missing.
  if (!hasLocaleScope) {
    await scopes.request(["read_locales"]);
    hasLocaleScope = true;
  }

  const [dbSettings, localesResult, lastSyncedAt, adminLanguage] =
    await Promise.all([
      readStorefrontSettingsRow(session.shop),
      fetchShopPublishedLocales(admin, session.shop),
      resolveShopLastSyncedAt(session.shop),
      resolveAdminLanguage(session.shop),
    ]);

  let { languages: shopLanguages, errors: shopLanguageErrors, missingLocaleScope } =
    localesResult;

  // Token/session said scopes were granted, but Admin API still denied shopLocales.
  if (missingLocaleScope) {
    await scopes.request(["read_locales"]);
    const retry = await fetchShopPublishedLocales(
      admin,
      `${session.shop}:${Date.now()}`,
    );
    shopLanguages = retry.languages;
    shopLanguageErrors = retry.errors;
    missingLocaleScope = retry.missingLocaleScope;
  }

  const storedTranslations = parseStoredStorefrontTranslations(
    dbSettings.translationsString,
  );

  /* Structure sync only on GET — MyMemory backfill runs after the response. */
  const translationSync = await syncStorefrontTranslationsWithShopLanguages(
    session.shop,
    admin,
    {
      existingTranslations: storedTranslations,
      syncInterval: dbSettings.syncInterval,
      shopLanguages:
        shopLanguages.length > 0 ? shopLanguages : FALLBACK_SHOP_LANGUAGES,
      skipAutoTranslate: true,
    },
  );

  if (translationSync.persisted || translationSync.needsAutoTranslate) {
    invalidateMemoryCachePrefix(`widget:${session.shop}:`);
    invalidateMemoryCachePrefix(`cart-rules:${session.shop}:`);
    invalidateMemoryCachePrefix(`sf-translations:${session.shop}`);
    runAfterResponse(
      (async () => {
        if (translationSync.needsAutoTranslate) {
          const backfill = await syncStorefrontTranslationsWithShopLanguages(
            session.shop,
            admin,
            {
              existingTranslations: translationSync.translations,
              syncInterval: dbSettings.syncInterval,
              shopLanguages: translationSync.shopLanguages,
            },
          );
          if (!backfill.persisted && !translationSync.persisted) return;
        }
        await pushStorefrontWidgetToShop(admin, session.shop).catch((e) => {
          console.error(
            "[volume-discount-settings] Failed refreshing storefront after translation sync",
            e,
          );
        });
      })(),
    );
  }

  scheduleDueSyncForShopIfNeeded(
    session.shop,
    dbSettings.syncInterval,
    lastSyncedAt,
  );
  applyShopCampaignScheduleTransitionsIfNeeded(session.shop);

  const settings: SettingsData = {
    syncInterval: dbSettings.syncInterval,
    lastSynced: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
    translations: translationSync.translations,
  };

  const needsLocaleScope = missingLocaleScope || !hasLocaleScope;
  if (needsLocaleScope) {
    shopLanguageErrors = [
      "Missing read_locales permission. Approve the permission prompt (or re-open the app from Shopify Admin).",
    ];
  } else {
    // English fallback already applied — don't block the Settings form with a hard error.
    shopLanguageErrors = [];
  }

  if (shopLanguageErrors.length > 0) {
    console.error(
      "[volume-discount-settings] shopLocales errors:",
      shopLanguageErrors.join("; "),
    );
  } else {
    console.log(
      "[volume-discount-settings] shopLocales loaded:",
      translationSync.shopLanguages.map((l) => l.label).join(", ") || "(none)",
    );
    if (translationSync.persisted) {
      console.log(
        "[volume-discount-settings] translation sheets stored for:",
        Object.keys(translationSync.translations).join(", "),
      );
    }
  }

  return data(
    {
      settings,
      shopLanguages: translationSync.shopLanguages,
      shopLanguageErrors,
      needsLocaleScope,
      translationsInitialized: translationSync.persisted,
      addedLanguages: translationSync.addedLanguages,
      canEditTranslations: (await resolveShopPlanContext(session.shop))
        .capabilities.translations,
      adminLanguage,
    },
    {
      headers: {
        "Set-Cookie": adminLanguageCookieHeader(adminLanguage),
      },
    },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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
      },
      {
        headers: {
          "Set-Cookie": adminLanguageCookieHeader(raw),
        },
      },
    );
  }

  if (intent === "saveSettings") {
    const { resolveShopPlanContext } = await import("../utils/shopPlan.server");
    const { upgradeMessage } = await import("../utils/pricingPlans");
    const { capabilities } = await resolveShopPlanContext(session.shop);
    if (!capabilities.translations) {
      return {
        ok: false,
        error: upgradeMessage("translations"),
      };
    }
    const syncInterval = String(formData.get("syncInterval") ?? "disabled");
    const submittedTranslations = parseStoredStorefrontTranslations(
      String(formData.get("translationsString") ?? "{}"),
    );
    const { languages: shopLanguages } = await fetchShopPublishedLocales(admin);
    const languageKeys = (shopLanguages.length > 0
      ? shopLanguages
      : FALLBACK_SHOP_LANGUAGES
    ).map((language) => language.value);
    const translations = buildStorefrontTranslationsForLanguages(
      languageKeys,
      submittedTranslations,
    );

    await persistStorefrontTranslations(session.shop, translations, syncInterval);
    scheduleDueSyncForShopIfNeeded(
      session.shop,
      syncInterval,
      await readShopLastSyncedAt(session.shop),
    );
    invalidateMemoryCachePrefix(`widget:${session.shop}:`);
    invalidateMemoryCachePrefix(`cart-rules:${session.shop}:`);

    try {
      const { errors: storefrontErrors } = await pushStorefrontWidgetToShop(
        admin,
        session.shop,
      );
      if (storefrontErrors.length > 0) {
        console.error(
          "[volume-discount-settings] Storefront push after save:",
          storefrontErrors.join("; "),
        );
        return {
          ok: true,
          message: "Settings saved",
          warning:
            "Storefront could not be updated automatically. Use Sync now, then hard-refresh the product page.",
        };
      }

      return {
        ok: true,
        message: "Settings saved and storefront translations updated",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Storefront update failed";
      console.error("[volume-discount-settings] Storefront push after save:", e);
      return {
        ok: true,
        message: "Settings saved",
        warning: msg,
      };
    }
  }

  if (intent === "autoTranslate") {
    const { resolveShopPlanContext } = await import("../utils/shopPlan.server");
    const { upgradeMessage } = await import("../utils/pricingPlans");
    const { capabilities } = await resolveShopPlanContext(session.shop);
    if (!capabilities.translations) {
      return {
        ok: false,
        error: upgradeMessage("translations"),
      };
    }
    const targetLang = String(formData.get("targetLang") ?? "")
      .trim()
      .toLowerCase();
    if (!targetLang) {
      return { ok: false, error: "Select a language to auto-translate" };
    }
    if (targetLang === "en") {
      return { ok: false, error: "English is the source language" };
    }

    const submittedTranslations = parseStoredStorefrontTranslations(
      String(formData.get("translationsString") ?? "{}"),
    );
    const { languages: shopLanguages } = await fetchShopPublishedLocales(admin);
    const languageKeys = (shopLanguages.length > 0
      ? shopLanguages
      : FALLBACK_SHOP_LANGUAGES
    ).map((language) => language.value);

    try {
      const source = resolveEnglishSourceForAutoTranslate(submittedTranslations);
      const translatedFields = await autoTranslateStorefrontFields(
        source,
        targetLang,
      );

      const translations = buildStorefrontTranslationsForLanguages(languageKeys, {
        ...submittedTranslations,
        [targetLang]: translatedFields,
      });

      const dbSettings = await readStorefrontSettingsRow(session.shop);
      await persistStorefrontTranslations(
        session.shop,
        translations,
        dbSettings.syncInterval,
      );
      const langLabel =
        shopLanguages.find((l) => l.value === targetLang)?.label ?? targetLang;

      invalidateMemoryCachePrefix(`widget:${session.shop}:`);
      invalidateMemoryCachePrefix(`cart-rules:${session.shop}:`);

      const { errors: storefrontErrors } = await pushStorefrontWidgetToShop(
        admin,
        session.shop,
      );
      if (storefrontErrors.length > 0) {
        console.error(
          "[volume-discount-settings] Storefront push after auto-translate:",
          storefrontErrors.join("; "),
        );
        return {
          ok: true,
          message: `Auto-translated to ${langLabel}`,
          translations,
          translatedLang: targetLang,
          warning:
            "Translations saved but storefront could not be updated. Use Sync now.",
        };
      }

      return {
        ok: true,
        message: `Auto-translated to ${langLabel} and storefront updated`,
        translations,
        translatedLang: targetLang,
      };
    } catch (e) {
      console.error("[volume-discount-settings] Auto-translate error:", e);
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "Auto-translate failed. Try again or enter translations manually.",
      };
    }
  }

  if (intent === "syncAll") {
    try {
      const activeCount = await prisma.volumeDiscountCampaign.count({
        where: { shop: session.shop, status: "active" },
      });
      const { errors, discountIds } = await syncVolumeDiscountShop(
        admin,
        session.shop,
        {
          purgeLegacy: true,
          force: true,
        },
      );

      if (errors && errors.length > 0) {
        return { ok: false, error: errors.join(", ") };
      }

      if (activeCount > 0 && discountIds.length === 0) {
        return {
          ok: false,
          error:
            "Active offers exist but Shopify did not create the automatic discount. Ensure the Offrefy function extension is deployed, then sync again.",
        };
      }

      invalidateMemoryCachePrefix(`widget:${session.shop}:`);
      invalidateMemoryCachePrefix(`cart-rules:${session.shop}:`);
      await refreshStorefrontWidgetForShop(admin, session.shop);
      await reconcileOrderAnalyticsForShop(session.shop, { force: true }).catch(
        () => {},
      );

      const syncedAt = new Date();
      await touchShopLastSyncedAt(session.shop, syncedAt);
      const lastSynced = syncedAt.toISOString();

      return { 
        ok: true, 
        message: "All automatic discount rules synchronised successfully with Shopify",
        lastSynced
      };
    } catch (e) {
      console.error("[volume-discount-sync] Manual sync error:", e);
      return { ok: false, error: e instanceof Error ? e.message : "Sync failed due to an internal error" };
    }
  }

  return { ok: false, error: "Invalid action intent" };
};

export default function SettingsPage() {
  const {
    settings,
    shopLanguages,
    shopLanguageErrors,
    needsLocaleScope,
    translationsInitialized,
    canEditTranslations,
    adminLanguage: initialAdminLanguage,
  } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const { t, setAdminLanguage, adminLanguage: liveAdminLanguage } =
    useAdminI18n();
  
  const settingsFetcher = useFetcher<typeof action>();
  const syncFetcher = useFetcher<typeof action>();
  const translateFetcher = useFetcher<typeof action>();
  const adminLangFetcher = useFetcher<typeof action>();

  // Local Form States
  const [syncInterval, setSyncInterval] = useState(settings.syncInterval);
  const [lastSynced, setLastSynced] = useState<string | null>(settings.lastSynced);
  const [translations, setTranslations] = useState<TranslationsMap>(settings.translations);
  const [adminLanguageDraft, setAdminLanguageDraft] =
    useState<AdminLanguageCode>(() =>
      normalizeAdminLanguage(initialAdminLanguage),
    );

  useEffect(() => {
    setLastSynced(settings.lastSynced);
  }, [settings.lastSynced]);

  useEffect(() => {
    setSyncInterval(settings.syncInterval);
  }, [settings.syncInterval]);

  useEffect(() => {
    setTranslations(settings.translations);
  }, [settings.translations]);

  useEffect(() => {
    setAdminLanguageDraft(normalizeAdminLanguage(initialAdminLanguage));
  }, [initialAdminLanguage]);

  useEffect(() => {
    setAdminLanguageDraft(liveAdminLanguage);
  }, [liveAdminLanguage]);

  useEffect(() => {
    if (!translationsInitialized) return;
    shopify.toast.show(t("settings.toast.sheetsCreated"));
  }, [translationsInitialized, shopify, t]);

  const revalidator = useRevalidator();
  const isRefreshingLanguages = revalidator.state === "loading";
  const savingAdminLanguage =
    adminLangFetcher.state !== "idle" &&
    String(adminLangFetcher.formData?.get("intent") ?? "") ===
      "saveAdminLanguage";

  const adminLanguageOptions = useMemo(
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

  // Language options loaded from Shopify (dedupe by translation key; prefer primary)
  const languageOptions = useMemo(() => {
    const byKey = new Map<
      string,
      { label: string; value: string; primary: boolean }
    >();
    for (const opt of shopLanguages) {
      const existing = byKey.get(opt.value);
      if (!existing || opt.primary) {
        byKey.set(opt.value, {
          label: opt.label,
          value: opt.value,
          primary: opt.primary,
        });
      }
    }
    return [...byKey.values()];
  }, [shopLanguages]);

  const primaryLang =
    languageOptions.find((l) => l.primary)?.value ||
    languageOptions[0]?.value ||
    "en";
  const [selectedLang, setSelectedLang] = useState(primaryLang);

  useEffect(() => {
    const match = languageOptions.find((l) => l.value === selectedLang);
    if (match) return;
    const primary = languageOptions.find((l) => l.primary) ?? languageOptions[0];
    if (primary) {
      setSelectedLang(primary.value);
    }
  }, [languageOptions, selectedLang]);

  useEffect(() => {
    if (syncInterval === "disabled") return;
    const timer = window.setInterval(() => {
      revalidator.revalidate();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [syncInterval, revalidator]);

  const handleLangChange = useCallback(
    (value: string) => {
      if (!canEditTranslations) return;
      if (!languageOptions.some((o) => o.value === value)) return;
      setSelectedLang(value);
    },
    [canEditTranslations, languageOptions],
  );

  // Update translation field for the active language
  const handleFieldChange = useCallback(
    (field: keyof TranslationFields, value: string) => {
      if (!canEditTranslations) return;
      setTranslations((prev) => {
        const activeLangDefaults = translationPresetForLanguage(selectedLang);
        return {
          ...prev,
          [selectedLang]: {
            ...activeLangDefaults,
            ...(prev[selectedLang] || {}),
            [field]: value,
          },
        };
      });
    },
    [canEditTranslations, selectedLang],
  );

  const handleSave = useCallback(() => {
    if (!canEditTranslations) {
      shopify.toast.show(t("settings.toast.upgradeTranslations"));
      return;
    }
    const data = new FormData();
    data.append("intent", "saveSettings");
    data.append("syncInterval", syncInterval);
    data.append("translationsString", JSON.stringify(translations));

    settingsFetcher.submit(data, { method: "post" });
  }, [
    canEditTranslations,
    syncInterval,
    translations,
    settingsFetcher,
    shopify,
    t,
  ]);

  const handleSyncNow = useCallback(() => {
    const data = new FormData();
    data.append("intent", "syncAll");
    syncFetcher.submit(data, { method: "post" });
  }, [syncFetcher]);

  const handleAutoTranslate = useCallback(() => {
    if (!canEditTranslations) {
      shopify.toast.show(t("settings.toast.upgradeTranslations"));
      return;
    }
    if (selectedLang === "en") {
      shopify.toast.show(t("settings.toast.englishSource"));
      return;
    }

    const data = new FormData();
    data.append("intent", "autoTranslate");
    data.append("targetLang", selectedLang);
    data.append("translationsString", JSON.stringify(translations));
    translateFetcher.submit(data, { method: "post" });
  }, [
    canEditTranslations,
    selectedLang,
    translations,
    translateFetcher,
    shopify,
    t,
  ]);

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
    adminLangFetcher.submit(fd, { method: "post" });
  }, [adminLanguageDraft, adminLangFetcher]);

  // Format Sync Time
  const formatSyncTime = useCallback(
    (isoString: string | null) => {
      if (!isoString) return t("settings.neverSynced");
      try {
        const date = new Date(isoString);
        return date.toLocaleString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });
      } catch (e) {
        return t("settings.unknownTime");
      }
    },
    [t],
  );

  // Listen to fetcher actions and trigger toast notifications
  useEffect(() => {
    if (settingsFetcher.data && settingsFetcher.state === "idle") {
      const result = settingsFetcher.data;
      if (result.ok) {
        const message =
          "message" in result && typeof result.message === "string"
            ? result.message
            : t("settings.toast.settingsSaved");
        shopify.toast.show(message);
        if ("warning" in result && typeof result.warning === "string") {
          shopify.toast.show(result.warning);
        }
      } else if ("error" in result && result.error) {
        shopify.toast.show(`Error: ${result.error}`);
      }
    }
  }, [settingsFetcher.data, settingsFetcher.state, shopify, t]);

  useEffect(() => {
    if (syncFetcher.data && syncFetcher.state === "idle") {
      const result = syncFetcher.data;
      if (result.ok) {
        const message =
          "message" in result && typeof result.message === "string"
            ? result.message
            : t("settings.toast.syncComplete");
        shopify.toast.show(message);
        if (
          "lastSynced" in result &&
          typeof result.lastSynced === "string" &&
          result.lastSynced
        ) {
          setLastSynced(result.lastSynced);
        }
      } else if ("error" in result && result.error) {
        shopify.toast.show(`Sync Error: ${result.error}`);
      }
    }
  }, [syncFetcher.data, syncFetcher.state, shopify, t]);

  useEffect(() => {
    if (translateFetcher.data && translateFetcher.state === "idle") {
      const result = translateFetcher.data;
      if (result.ok) {
        if (
          "translations" in result &&
          result.translations &&
          typeof result.translations === "object"
        ) {
          setTranslations(result.translations);
        }
        const message =
          "message" in result && typeof result.message === "string"
            ? result.message
            : t("settings.toast.autoTranslateComplete");
        shopify.toast.show(message);
      } else if ("error" in result && result.error) {
        shopify.toast.show(`Auto-translate error: ${result.error}`);
      }
    }
  }, [translateFetcher.data, translateFetcher.state, shopify, t]);

  useEffect(() => {
    if (!adminLangFetcher.data || adminLangFetcher.state !== "idle") return;
    if (!("intent" in adminLangFetcher.data)) return;
    if (adminLangFetcher.data.intent !== "saveAdminLanguage") return;
    if (!adminLangFetcher.data.ok) {
      shopify.toast.show(
        adminLangFetcher.data.error || t("settings.adminLanguageSaveError"),
        { isError: true },
      );
      return;
    }
    if (
      "adminLanguage" in adminLangFetcher.data &&
      adminLangFetcher.data.adminLanguage
    ) {
      const next = normalizeAdminLanguage(adminLangFetcher.data.adminLanguage);
      setAdminLanguage(next);
      setAdminLanguageDraft(next);
    }
    shopify.toast.show(t("settings.adminLanguageSaved"));
  }, [adminLangFetcher.data, adminLangFetcher.state, setAdminLanguage, shopify, t]);

  const isSaving = settingsFetcher.state === "submitting";
  const isSyncing = syncFetcher.state === "submitting";
  const isAutoTranslating = translateFetcher.state === "submitting";

  // Get active translation block
  const activeTranslation =
    translations[selectedLang] ||
    translationPresetForLanguage(selectedLang);

  return (
    <Page
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
      compactTitle
      primaryAction={{
        content: planLockedActionContent(
          t("settings.save"),
          !canEditTranslations,
          t("common.upgradePlan"),
        ),
        onAction: handleSave,
        loading: isSaving,
        disabled: !canEditTranslations,
      }}
    >
      <BlockStack gap="500">
        <Layout>
          {/* Left Side: Storefront Translations */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {t("settings.storefrontTranslations")}
                </Text>
                {!canEditTranslations ? (
                  <PlanUpgradeBanner feature="translations" />
                ) : null}
                <Text as="p" tone="subdued">
                  {t("settings.storefrontHelp")}
                </Text>
                {shopLanguageErrors.length > 0 && (
                  <Banner tone="warning">
                    <p>
                      {shopLanguageErrors.join(" ")}
                      {needsLocaleScope
                        ? t("settings.localeScopeHint")
                        : t("settings.refreshLanguagesHint")}
                    </p>
                  </Banner>
                )}
                <Divider />

                <AdminLanguageDropdown
                  label={t("settings.language")}
                  options={languageOptions.map((opt) => ({
                    label: opt.label,
                    value: opt.value,
                  }))}
                  value={selectedLang}
                  onChange={handleLangChange}
                  disabled={!canEditTranslations || languageOptions.length === 0}
                  helpText={
                    canEditTranslations
                      ? t("settings.languageHelp")
                      : t("settings.languageHelpLocked")
                  }
                />

                <InlineStack gap="200" wrap>
                  <Button
                    icon={AutomationIcon}
                    onClick={handleAutoTranslate}
                    loading={isAutoTranslating}
                    disabled={!canEditTranslations || selectedLang === "en"}
                    tone="success"
                  >
                    {t("settings.autoTranslate")}
                  </Button>
                  <Button
                    icon={RefreshIcon}
                    onClick={() => revalidator.revalidate()}
                    loading={isRefreshingLanguages}
                  >
                    {t("settings.reload")}
                  </Button>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("settings.autoTranslateHelp")}
                </Text>

                <Divider />

                <FormLayout>
                  {/* Compact 2-column layout for main labels */}
                  <FormLayout.Group>
                    <TextField
                      label={t("settings.widgetHeading")}
                      value={activeTranslation.transHeading}
                      onChange={(v) => handleFieldChange("transHeading", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.heading")}
                      disabled={!canEditTranslations}
                    />
                    <TextField
                      label={t("settings.ctaText")}
                      value={activeTranslation.transCta}
                      onChange={(v) => handleFieldChange("transCta", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.cta")}
                      disabled={!canEditTranslations}
                    />
                  </FormLayout.Group>

                  {/* Compact 3-column layout for table headers */}
                  <FormLayout.Group>
                    <TextField
                      label={t("settings.qtyColumn")}
                      value={activeTranslation.transQty}
                      onChange={(v) => handleFieldChange("transQty", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.qty")}
                      disabled={!canEditTranslations}
                    />
                    <TextField
                      label={t("settings.discountColumn")}
                      value={activeTranslation.transDiscount}
                      onChange={(v) => handleFieldChange("transDiscount", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.discount")}
                      disabled={!canEditTranslations}
                    />
                    <TextField
                      label={t("settings.priceColumn")}
                      value={activeTranslation.transPrice}
                      onChange={(v) => handleFieldChange("transPrice", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.price")}
                      disabled={!canEditTranslations}
                    />
                  </FormLayout.Group>

                  <FormLayout.Group>
                    <TextField
                      label={t("settings.buyPrefix")}
                      value={activeTranslation.transBuy}
                      onChange={(v) => handleFieldChange("transBuy", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.buy")}
                      helpText={t("settings.help.buyPrefix")}
                      disabled={!canEditTranslations}
                    />
                    <TextField
                      label={t("settings.youSave")}
                      value={activeTranslation.transYouSave}
                      onChange={(v) => handleFieldChange("transYouSave", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.youSave")}
                      disabled={!canEditTranslations}
                    />
                  </FormLayout.Group>

                  <FormLayout.Group>
                    <TextField
                      label={t("settings.addLabel")}
                      value={activeTranslation.transAdd}
                      onChange={(v) => handleFieldChange("transAdd", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.add")}
                      disabled={!canEditTranslations}
                    />
                  </FormLayout.Group>

                  <FormLayout.Group>
                    <TextField
                      label={t("settings.cartDiscount")}
                      value={activeTranslation.transCartDiscount}
                      onChange={(v) => handleFieldChange("transCartDiscount", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.cartDiscount")}
                      helpText={t("settings.help.cartDiscount")}
                      disabled={!canEditTranslations}
                    />
                    <TextField
                      label={t("settings.cartDiscountQty")}
                      value={activeTranslation.transCartDiscountQty}
                      onChange={(v) => handleFieldChange("transCartDiscountQty", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.cartDiscountQty")}
                      helpText={t("settings.help.cartDiscountQty")}
                      disabled={!canEditTranslations}
                    />
                  </FormLayout.Group>

                  {/* Compact 2-column layout for remaining helper text */}
                  <FormLayout.Group>
                    <TextField
                      label={t("settings.countdown")}
                      value={activeTranslation.transCountdown}
                      onChange={(v) => handleFieldChange("transCountdown", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.countdown")}
                      disabled={!canEditTranslations}
                    />
                    <TextField
                      label={t("settings.footnote")}
                      value={activeTranslation.transFootnote}
                      onChange={(v) => handleFieldChange("transFootnote", v)}
                      autoComplete="off"
                      placeholder={t("settings.ph.footnote")}
                      disabled={!canEditTranslations}
                    />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Right Side: Manual Actions + Admin Language */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {t("settings.adminLanguage")}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("settings.adminLanguageHelp")}
                  </Text>
                  <AdminLanguageDropdown
                    label={t("common.language")}
                    options={adminLanguageOptions}
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
                        normalizeAdminLanguage(initialAdminLanguage)
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
                  {syncFetcher.data && !syncFetcher.data.ok && (
                    <Banner title={t("settings.syncFailed")} tone="critical">
                      <p>{syncFetcher.data.error || t("common.unknownError")}</p>
                    </Banner>
                  )}
                  <InlineStack align="space-between" blockAlign="center">
                    <Button onClick={handleSyncNow} loading={isSyncing} variant="primary">
                      {t("settings.syncNow")}
                    </Button>
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">
                        {t("settings.lastSynced")}
                      </Text>
                      <Text as="p" variant="bodyMd" tone={lastSynced ? "success" : "subdued"}>
                        {formatSyncTime(lastSynced)}
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
