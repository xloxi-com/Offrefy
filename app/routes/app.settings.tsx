import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  FormLayout,
  Select,
  TextField,
  Divider,
  Button,
  InlineStack,
  Banner,
  Tabs,
  Combobox,
  Listbox,
  Icon,
  AutoSelection,
} from "@shopify/polaris";
import { SearchIcon, RefreshIcon, AutomationIcon } from "@shopify/polaris-icons";
import { ApprovefyPromoCard } from "../components/ApprovefyPromoCard";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { syncVolumeDiscountShop } from "../services/volumeDiscountFunctionSync.server";
import { refreshStorefrontWidgetForShop, pushStorefrontWidgetToShop } from "../services/refreshStorefrontWidget.server";
import { scheduleDueSyncForShopIfNeeded } from "../services/scheduledVolumeDiscountSync.server";
import { reconcileOrderAnalyticsForShop } from "../services/orderAnalyticsReconcile.server";
import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
import {
  readShopLastSyncedAt,
  resolveShopLastSyncedAt,
  touchShopLastSyncedAt,
} from "../utils/shopSyncState.server";
import {
  FALLBACK_SHOP_LANGUAGES,
  fetchShopPublishedLocales,
} from "../utils/shopPublishedLocales.server";
import {
  ENGLISH_STOREFRONT_TRANSLATION,
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

type TranslationFields = StorefrontTranslationFields;
type TranslationsMap = StorefrontTranslationsMap;

type SettingsData = {
  syncInterval: string;
  lastSynced: string | null;
  translations: TranslationsMap;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const grantedScopes = (session.scope ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  const hasLocaleScope =
    grantedScopes.includes("read_locales") ||
    grantedScopes.includes("read_markets_home");

  const dbSettings = await readStorefrontSettingsRow(session.shop);
  const storedTranslations = parseStoredStorefrontTranslations(
    dbSettings.translationsString,
  );

  const { languages: shopLanguages, errors: shopLanguageErrors } =
    await fetchShopPublishedLocales(admin);

  const translationSync = await syncStorefrontTranslationsWithShopLanguages(
    session.shop,
    admin,
    {
      existingTranslations: storedTranslations,
      syncInterval: dbSettings.syncInterval,
      shopLanguages:
        shopLanguages.length > 0 ? shopLanguages : FALLBACK_SHOP_LANGUAGES,
    },
  );

  if (translationSync.persisted) {
    invalidateMemoryCachePrefix(`widget:${session.shop}:`);
    invalidateMemoryCachePrefix(`cart-rules:${session.shop}:`);
    try {
      await pushStorefrontWidgetToShop(admin, session.shop);
    } catch (e) {
      console.error(
        "[volume-discount-settings] Failed refreshing storefront after translation sync",
        e,
      );
    }
  }

  const lastSyncedAt = await resolveShopLastSyncedAt(session.shop);
  scheduleDueSyncForShopIfNeeded(
    session.shop,
    dbSettings.syncInterval,
    lastSyncedAt,
  );

  const settings: SettingsData = {
    syncInterval: dbSettings.syncInterval,
    lastSynced: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
    translations: translationSync.translations,
  };

  if (!hasLocaleScope) {
    shopLanguageErrors.unshift(
      "Missing read_locales permission. Re-open the app from Shopify Admin to approve the new permission.",
    );
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

  return {
    settings,
    shopLanguages: translationSync.shopLanguages,
    shopLanguageErrors,
    needsLocaleScope: !hasLocaleScope,
    translationsInitialized: translationSync.persisted,
    addedLanguages: translationSync.addedLanguages,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "saveSettings") {
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
  const { settings, shopLanguages, shopLanguageErrors, needsLocaleScope, translationsInitialized } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  
  const settingsFetcher = useFetcher<typeof action>();
  const syncFetcher = useFetcher<typeof action>();
  const translateFetcher = useFetcher<typeof action>();

  // Local Form States
  const [syncInterval, setSyncInterval] = useState(settings.syncInterval);
  const [lastSynced, setLastSynced] = useState<string | null>(settings.lastSynced);
  const [translations, setTranslations] = useState<TranslationsMap>(settings.translations);

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
    if (!translationsInitialized) return;
    shopify.toast.show("Translation sheets created for all Shopify store languages");
  }, [translationsInitialized, shopify]);

  const revalidator = useRevalidator();
  const isRefreshingLanguages = revalidator.state === "loading";

  // Language options loaded from Shopify (server-side via loader)
  const languageOptions = shopLanguages;
  const primaryLang = languageOptions.find((l) => l.primary)?.value || languageOptions[0]?.value || "en";
  const [selectedLang, setSelectedLang] = useState(primaryLang);

  const selectedLangOption = languageOptions.find((l) => l.value === selectedLang);
  const [langSearchValue, setLangSearchValue] = useState("");
  const [isLangSearchActive, setIsLangSearchActive] = useState(false);

  const langInputValue = isLangSearchActive
    ? langSearchValue
    : (selectedLangOption?.label ?? "");

  useEffect(() => {
    const match = shopLanguages.find((l) => l.value === selectedLang);
    if (match) return;
    const primary = shopLanguages.find((l) => l.primary) ?? shopLanguages[0];
    if (primary) {
      setSelectedLang(primary.value);
    }
  }, [shopLanguages, selectedLang]);

  const filteredLangOptions =
    isLangSearchActive && langSearchValue
      ? languageOptions.filter((opt) =>
          opt.label.toLowerCase().includes(langSearchValue.toLowerCase()),
        )
      : languageOptions;

  useEffect(() => {
    if (syncInterval === "disabled") return;
    const timer = window.setInterval(() => {
      revalidator.revalidate();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [syncInterval, revalidator]);

  const handleLangComboboxChange = useCallback(
    (value: string) => {
      const opt = languageOptions.find((o) => o.value === value);
      if (opt) {
        setSelectedLang(value);
        setLangSearchValue("");
        setIsLangSearchActive(false);
      }
    },
    [languageOptions]
  );

  const handleLangTextChange = useCallback((value: string) => {
    setLangSearchValue(value);
    setIsLangSearchActive(true);
  }, []);

  const handleLangFocus = useCallback(() => {
    setLangSearchValue("");
    setIsLangSearchActive(true);
  }, []);

  const handleSyncIntervalChange = useCallback((value: string) => setSyncInterval(value), []);

  // Update translation field for the active language
  const handleFieldChange = useCallback((field: keyof TranslationFields, value: string) => {
    setTranslations((prev) => {
      const activeLangDefaults =
        translationPresetForLanguage(selectedLang);
      return {
        ...prev,
        [selectedLang]: {
          ...activeLangDefaults,
          ...(prev[selectedLang] || {}),
          [field]: value,
        },
      };
    });
  }, [selectedLang]);

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.append("intent", "saveSettings");
    data.append("syncInterval", syncInterval);
    data.append("translationsString", JSON.stringify(translations));

    settingsFetcher.submit(data, { method: "post" });
  }, [syncInterval, translations, settingsFetcher]);

  const handleSyncNow = useCallback(() => {
    const data = new FormData();
    data.append("intent", "syncAll");
    syncFetcher.submit(data, { method: "post" });
  }, [syncFetcher]);

  const handleAutoTranslate = useCallback(() => {
    if (selectedLang === "en") {
      shopify.toast.show("English is the source language");
      return;
    }

    const data = new FormData();
    data.append("intent", "autoTranslate");
    data.append("targetLang", selectedLang);
    data.append("translationsString", JSON.stringify(translations));
    translateFetcher.submit(data, { method: "post" });
  }, [selectedLang, translations, translateFetcher, shopify]);

  // Format Sync Time
  const formatSyncTime = useCallback((isoString: string | null) => {
    if (!isoString) return "Never synced";
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
      return "Unknown";
    }
  }, []);

  // Listen to fetcher actions and trigger toast notifications
  useEffect(() => {
    if (settingsFetcher.data && settingsFetcher.state === "idle") {
      if (settingsFetcher.data.ok) {
        shopify.toast.show(settingsFetcher.data.message || "Settings saved");
        if (settingsFetcher.data.warning) {
          shopify.toast.show(settingsFetcher.data.warning);
        }
      } else if (settingsFetcher.data.error) {
        shopify.toast.show(`Error: ${settingsFetcher.data.error}`);
      }
    }
  }, [settingsFetcher.data, settingsFetcher.state, shopify]);

  useEffect(() => {
    if (syncFetcher.data && syncFetcher.state === "idle") {
      if (syncFetcher.data.ok) {
        shopify.toast.show(syncFetcher.data.message || "Shopify sync complete");
        if (syncFetcher.data.lastSynced) {
          setLastSynced(syncFetcher.data.lastSynced);
        }
      } else if (syncFetcher.data.error) {
        shopify.toast.show(`Sync Error: ${syncFetcher.data.error}`);
      }
    }
  }, [syncFetcher.data, syncFetcher.state, shopify]);

  useEffect(() => {
    if (translateFetcher.data && translateFetcher.state === "idle") {
      if (translateFetcher.data.ok) {
        if (translateFetcher.data.translations) {
          setTranslations(translateFetcher.data.translations);
        }
        shopify.toast.show(
          translateFetcher.data.message || "Auto-translate complete",
        );
      } else if (translateFetcher.data.error) {
        shopify.toast.show(`Auto-translate error: ${translateFetcher.data.error}`);
      }
    }
  }, [translateFetcher.data, translateFetcher.state, shopify]);

  const syncIntervalOptions = [
    { label: "Disabled (Manual Sync Only)", value: "disabled" },
    { label: "Every 5 Minutes", value: "5m" },
    { label: "Every 15 Minutes", value: "15m" },
    { label: "Every 30 Minutes", value: "30m" },
    { label: "Every 1 Hour", value: "1h" },
    { label: "Every 6 Hours", value: "6h" },
    { label: "Every 12 Hours", value: "12h" },
    { label: "Every 24 Hours", value: "24h" },
  ];

  const isSaving = settingsFetcher.state === "submitting";
  const isSyncing = syncFetcher.state === "submitting";
  const isAutoTranslating = translateFetcher.state === "submitting";

  // Get active translation block
  const activeTranslation =
    translations[selectedLang] ||
    translationPresetForLanguage(selectedLang);

  return (
    <Page
      title="Settings"
      subtitle="Manage sync settings and storefront translations."
      compactTitle
      primaryAction={{
        content: "Save settings",
        onAction: handleSave,
        loading: isSaving,
      }}
    >
      <BlockStack gap="500">
        <Layout>
          {/* Left Side: Storefront Translations */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Storefront Translations
                </Text>
                <Text as="p" tone="subdued">
                  Translate widget headings and table labels.
                </Text>
                {shopLanguageErrors.length > 0 && (
                  <Banner tone="warning">
                    <p>
                      {shopLanguageErrors.join(" ")}
                      {needsLocaleScope
                        ? " Then refresh this page after approving permissions."
                        : " Use the refresh button if languages were added in Shopify recently."}
                    </p>
                  </Banner>
                )}
                <Divider />
                
                <Combobox
                  activator={
                    <Combobox.TextField
                      prefix={<Icon source={SearchIcon} />}
                      onChange={handleLangTextChange}
                      onFocus={handleLangFocus}
                      label="Language"
                      value={langInputValue}
                      placeholder="Search language..."
                      autoComplete="off"
                    />
                  }
                >
                  {filteredLangOptions.length > 0 ? (
                    <Listbox
                      autoSelection={AutoSelection.None}
                      onSelect={handleLangComboboxChange}
                    >
                      {filteredLangOptions.map((opt) => (
                        <Listbox.Option
                          key={opt.locale}
                          value={opt.value}
                          selected={selectedLang === opt.value}
                          accessibilityLabel={opt.label}
                        >
                          {opt.label}
                        </Listbox.Option>
                      ))}
                    </Listbox>
                  ) : (
                    <Listbox>
                      <Listbox.Option value="" disabled accessibilityLabel="No results">
                        No languages found
                      </Listbox.Option>
                    </Listbox>
                  )}
                </Combobox>

                <InlineStack gap="200" wrap>
                  <Button
                    icon={AutomationIcon}
                    onClick={handleAutoTranslate}
                    loading={isAutoTranslating}
                    disabled={selectedLang === "en"}
                    tone="success"
                  >
                    Auto translate
                  </Button>
                  <Button
                    icon={RefreshIcon}
                    onClick={() => revalidator.revalidate()}
                    loading={isRefreshingLanguages}
                  >
                    Reload
                  </Button>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Select a language, then use Auto translate to fill all fields from
                  English. Use Reload to refresh languages from Shopify.
                </Text>

                <Divider />

                <FormLayout>
                  {/* Compact 2-column layout for main labels */}
                  <FormLayout.Group>
                    <TextField
                      label="Widget Heading"
                      value={activeTranslation.transHeading}
                      onChange={(v) => handleFieldChange("transHeading", v)}
                      autoComplete="off"
                      placeholder="e.g. Buy more save more"
                    />
                    <TextField
                      label="Add to Cart Button Text"
                      value={activeTranslation.transCta}
                      onChange={(v) => handleFieldChange("transCta", v)}
                      autoComplete="off"
                      placeholder="e.g. Grab this deal"
                    />
                  </FormLayout.Group>

                  {/* Compact 3-column layout for table headers */}
                  <FormLayout.Group>
                    <TextField
                      label="Quantity Column Title"
                      value={activeTranslation.transQty}
                      onChange={(v) => handleFieldChange("transQty", v)}
                      autoComplete="off"
                      placeholder="e.g. Qty"
                    />
                    <TextField
                      label="Discount Column Title"
                      value={activeTranslation.transDiscount}
                      onChange={(v) => handleFieldChange("transDiscount", v)}
                      autoComplete="off"
                      placeholder="e.g. Discount"
                    />
                    <TextField
                      label="Price Column Title"
                      value={activeTranslation.transPrice}
                      onChange={(v) => handleFieldChange("transPrice", v)}
                      autoComplete="off"
                      placeholder="e.g. Price / ea"
                    />
                  </FormLayout.Group>

                  <FormLayout.Group>
                    <TextField
                      label="Tier Label Prefix (Buy)"
                      value={activeTranslation.transBuy}
                      onChange={(v) => handleFieldChange("transBuy", v)}
                      autoComplete="off"
                      placeholder="e.g. Buy"
                      helpText='Used for tier labels like "Buy 10" → "Achetez 10".'
                    />
                    <TextField
                      label="Savings Text (You save)"
                      value={activeTranslation.transYouSave}
                      onChange={(v) => handleFieldChange("transYouSave", v)}
                      autoComplete="off"
                      placeholder="e.g. You save"
                    />
                  </FormLayout.Group>

                  <FormLayout.Group>
                    <TextField
                      label="Tier Add Button Text"
                      value={activeTranslation.transAdd}
                      onChange={(v) => handleFieldChange("transAdd", v)}
                      autoComplete="off"
                      placeholder="e.g. Add"
                    />
                  </FormLayout.Group>

                  <FormLayout.Group>
                    <TextField
                      label="Cart Discount Badge"
                      value={activeTranslation.transCartDiscount}
                      onChange={(v) => handleFieldChange("transCartDiscount", v)}
                      autoComplete="off"
                      placeholder="e.g. {{ discount }} OFF"
                      helpText="Shown in cart/checkout, e.g. 6% OFF. Use {{ discount }} and {{ amount }}."
                    />
                    <TextField
                      label="Cart Discount Quantity Suffix"
                      value={activeTranslation.transCartDiscountQty}
                      onChange={(v) => handleFieldChange("transCartDiscountQty", v)}
                      autoComplete="off"
                      placeholder="e.g. (qty {{ qty }})"
                      helpText='Grouped quantity label, e.g. "(qty 20)" → "(qté 20)".'
                    />
                  </FormLayout.Group>

                  {/* Compact 2-column layout for remaining helper text */}
                  <FormLayout.Group>
                    <TextField
                      label="Countdown Timer Text"
                      value={activeTranslation.transCountdown}
                      onChange={(v) => handleFieldChange("transCountdown", v)}
                      autoComplete="off"
                      placeholder="e.g. Sale ends in"
                    />
                    <TextField
                      label="Footnote / Helper Text"
                      value={activeTranslation.transFootnote}
                      onChange={(v) => handleFieldChange("transFootnote", v)}
                      autoComplete="off"
                      placeholder="e.g. Pick a tier to set quantity, then add to cart."
                    />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Right Side: Shopify Sync Schedule & Manual Actions */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              
              {/* Manual Actions Card */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Manual Actions
                  </Text>
                  <Text as="p" tone="subdued">
                    Instantly push all active offers to your storefront.
                  </Text>
                  <Divider />
                  {syncFetcher.data && !syncFetcher.data.ok && (
                    <Banner title="Sync Failed" tone="critical">
                      <p>{syncFetcher.data.error || "An unknown error occurred during manual synchronization."}</p>
                    </Banner>
                  )}
                  <InlineStack align="space-between" blockAlign="center">
                    <Button onClick={handleSyncNow} loading={isSyncing} variant="primary">
                      Sync now
                    </Button>
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">
                        Last synced:
                      </Text>
                      <Text as="p" variant="bodyMd" tone={lastSynced ? "success" : "subdued"}>
                        {formatSyncTime(lastSynced)}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* Sync Schedule Card */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Shopify Sync Schedule
                  </Text>
                  <Text as="p" tone="subdued">
                    Set automated background sync intervals.
                  </Text>
                  <Divider />
                  <FormLayout>
                    <Select
                      label="Sync Interval"
                      options={syncIntervalOptions}
                      onChange={handleSyncIntervalChange}
                      value={syncInterval}
                    />
                  </FormLayout>
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
