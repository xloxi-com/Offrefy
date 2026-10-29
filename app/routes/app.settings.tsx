import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  InlineStack,
  Select,
  Checkbox,
} from "@shopify/polaris";
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

type TranslationsMap = StorefrontTranslationsMap;

type SettingsData = {
  syncInterval: string;
  lastSynced: string | null;
  translations: TranslationsMap;
  combinesWith: {
    productDiscounts: boolean;
    orderDiscounts: boolean;
    shippingDiscounts: boolean;
  };
  canUseSchedulingAutomation: boolean;
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

  const [{ capabilities }, combinesWith] = await Promise.all([
    resolveShopPlanContext(session.shop),
    import("../utils/discountCombinesWith.server").then((m) =>
      m.readDiscountCombinesWith(session.shop),
    ),
  ]);

  const settings: SettingsData = {
    syncInterval: dbSettings.syncInterval,
    lastSynced: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
    translations: translationSync.translations,
    combinesWith,
    canUseSchedulingAutomation: capabilities.schedulingAutomation,
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

  if (intent === "saveSyncStacking") {
    const {
      normalizeSyncInterval,
      persistDiscountCombinesWith,
    } = await import("../utils/discountCombinesWith.server");
    const syncInterval = normalizeSyncInterval(
      String(formData.get("syncInterval") ?? "disabled"),
    );
    const combinesWith = {
      productDiscounts: formData.get("combinesWithProduct") === "1",
      orderDiscounts: formData.get("combinesWithOrder") === "1",
      shippingDiscounts: formData.get("combinesWithShipping") === "1",
    };
    await persistDiscountCombinesWith(session.shop, combinesWith);
    // Keep translations; only flip syncInterval
    const row = await readStorefrontSettingsRow(session.shop);
    const translations = parseStoredStorefrontTranslations(
      row.translationsString,
    );
    await persistStorefrontTranslations(
      session.shop,
      translations,
      syncInterval,
    );
    scheduleDueSyncForShopIfNeeded(
      session.shop,
      syncInterval,
      await readShopLastSyncedAt(session.shop),
    );
    // Push discount combinesWith via Function sync
    runAfterResponse(
      (async () => {
        try {
          await syncVolumeDiscountShop(admin, session.shop, {
            force: true,
            purgeLegacy: false,
          });
        } catch (e) {
          console.error("[volume-discount-settings] sync after stacking", e);
        }
      })(),
    );
    return {
      ok: true,
      message: "Sync & stacking settings saved",
      intent,
    };
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

    const submittedTranslations = parseStoredStorefrontTranslations(
      String(formData.get("translationsString") ?? "{}"),
    );
    const { languages: shopLanguages } = await fetchShopPublishedLocales(admin);
    const languageKeys = (shopLanguages.length > 0
      ? shopLanguages
      : FALLBACK_SHOP_LANGUAGES
    ).map((language) => language.value);
    const primaryLang =
      (shopLanguages.length > 0
        ? shopLanguages
        : FALLBACK_SHOP_LANGUAGES
      ).find((language) => language.primary)?.value ??
      languageKeys[0] ??
      "en";

    if (targetLang === primaryLang) {
      return {
        ok: false,
        error: "Storefront primary language is the source language",
      };
    }

    try {
      const source = resolveEnglishSourceForAutoTranslate(
        submittedTranslations,
        primaryLang,
      );
      const translatedFields = await autoTranslateStorefrontFields(
        source,
        targetLang,
        primaryLang,
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
  const { settings, adminLanguage: initialAdminLanguage } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const { t, setAdminLanguage, adminLanguage: liveAdminLanguage } =
    useAdminI18n();

  const adminLangFetcher = useFetcher<typeof action>();
  const syncStackFetcher = useFetcher<typeof action>();

  const [syncInterval, setSyncInterval] = useState(settings.syncInterval);
  const [lastSynced, setLastSynced] = useState<string | null>(settings.lastSynced);
  const [combineProduct, setCombineProduct] = useState(
    settings.combinesWith.productDiscounts,
  );
  const [combineOrder, setCombineOrder] = useState(
    settings.combinesWith.orderDiscounts,
  );
  const [combineShipping, setCombineShipping] = useState(
    settings.combinesWith.shippingDiscounts,
  );
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
    setCombineProduct(settings.combinesWith.productDiscounts);
    setCombineOrder(settings.combinesWith.orderDiscounts);
    setCombineShipping(settings.combinesWith.shippingDiscounts);
  }, [settings.combinesWith]);

  useEffect(() => {
    setAdminLanguageDraft(normalizeAdminLanguage(initialAdminLanguage));
  }, [initialAdminLanguage]);

  useEffect(() => {
    setAdminLanguageDraft(liveAdminLanguage);
  }, [liveAdminLanguage]);

  const revalidator = useRevalidator();
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

  useEffect(() => {
    if (syncInterval === "disabled") return;
    const timer = window.setInterval(() => {
      revalidator.revalidate();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [syncInterval, revalidator]);

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
      } catch {
        return t("settings.unknownTime");
      }
    },
    [t],
  );

  const handleSaveSyncStacking = useCallback(() => {
    const data = new FormData();
    data.append("intent", "saveSyncStacking");
    data.append("syncInterval", syncInterval);
    data.append("combinesWithProduct", combineProduct ? "1" : "0");
    data.append("combinesWithOrder", combineOrder ? "1" : "0");
    data.append("combinesWithShipping", combineShipping ? "1" : "0");
    syncStackFetcher.submit(data, { method: "post" });
  }, [
    syncInterval,
    combineProduct,
    combineOrder,
    combineShipping,
    syncStackFetcher,
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

  useEffect(() => {
    if (syncStackFetcher.data && syncStackFetcher.state === "idle") {
      const result = syncStackFetcher.data;
      if (result.ok) {
        shopify.toast.show(t("settings.toast.syncStackSaved"));
      } else if ("error" in result && result.error) {
        shopify.toast.show(
          t("common.errorWithMessage", { message: result.error }),
        );
      }
    }
  }, [syncStackFetcher.data, syncStackFetcher.state, shopify, t]);

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

  return (
    <Page
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
      compactTitle
    >
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {t("settings.syncStacking")}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {settings.canUseSchedulingAutomation
                      ? t("settings.syncStackingHelp")
                      : t("settings.syncStackingHelpLocked")}
                  </Text>
                  <Select
                    label={t("settings.autoSyncInterval")}
                    options={[
                      {
                        label: t("settings.syncInterval.disabled"),
                        value: "disabled",
                      },
                      { label: t("settings.syncInterval.5m"), value: "5m" },
                      { label: t("settings.syncInterval.15m"), value: "15m" },
                      { label: t("settings.syncInterval.30m"), value: "30m" },
                      { label: t("settings.syncInterval.1h"), value: "1h" },
                      { label: t("settings.syncInterval.6h"), value: "6h" },
                      { label: t("settings.syncInterval.12h"), value: "12h" },
                      { label: t("settings.syncInterval.24h"), value: "24h" },
                    ]}
                    value={
                      settings.canUseSchedulingAutomation
                        ? syncInterval
                        : "disabled"
                    }
                    onChange={setSyncInterval}
                    disabled={!settings.canUseSchedulingAutomation}
                  />
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">
                      {t("settings.lastSynced")}
                    </Text>
                    <Text
                      as="p"
                      variant="bodyMd"
                      tone={lastSynced ? "success" : "subdued"}
                    >
                      {formatSyncTime(lastSynced)}
                    </Text>
                  </BlockStack>
                  <Text as="h3" variant="headingSm">
                    {t("settings.combineWith")}
                  </Text>
                  <Checkbox
                    label={t("settings.combineProduct")}
                    checked={combineProduct}
                    onChange={setCombineProduct}
                  />
                  <Checkbox
                    label={t("settings.combineOrder")}
                    checked={combineOrder}
                    onChange={setCombineOrder}
                  />
                  <Checkbox
                    label={t("settings.combineShipping")}
                    checked={combineShipping}
                    onChange={setCombineShipping}
                  />
                  <InlineStack align="end">
                    <Button
                      variant="primary"
                      onClick={handleSaveSyncStacking}
                      loading={syncStackFetcher.state !== "idle"}
                    >
                      {t("settings.saveSync")}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>

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

              <ApprovefyPromoCard />
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
