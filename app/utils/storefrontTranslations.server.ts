import { prisma } from "../db.server";
import {
  autoTranslateCartBadgeStrings,
  autoTranslateStorefrontFields,
  autoTranslateTierCopyFields,
  autoTranslateTierStrings,
  hasUntranslatedCartBadgeStrings,
  hasUntranslatedTierStrings,
  resolveEnglishSourceForAutoTranslate,
} from "./storefrontAutoTranslate.server";
import {
  FALLBACK_SHOP_LANGUAGES,
  fetchShopPublishedLocales,
  type ShopLanguageOption,
} from "./shopPublishedLocales.server";
import {
  adaptCartDiscountTemplateForLanguage,
  buildStorefrontTranslationsForLanguages,
  ENGLISH_STOREFRONT_TRANSLATION,
  hasCuratedTranslationPreset,
  STOREFRONT_TRANSLATION_FIELD_KEYS,
  sparsifyStorefrontTranslations,
  type StorefrontTranslationFields,
  type StorefrontTranslationsMap,
  type TierCopyFields,
} from "./storefrontTranslations";
import {
  getMemoryCachedJson,
  setMemoryCachedJson,
  invalidateMemoryCachePrefix,
} from "./memoryCache.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export function languageKeysFromShopLanguages(
  shopLanguages: ShopLanguageOption[],
): string[] {
  const languages =
    shopLanguages.length > 0 ? shopLanguages : FALLBACK_SHOP_LANGUAGES;
  return languages.map((language) => language.value);
}

export function parseStoredStorefrontTranslations(
  translationsString: string | null | undefined,
): StorefrontTranslationsMap {
  if (!translationsString) return {};
  try {
    const parsed = JSON.parse(translationsString);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as StorefrontTranslationsMap;
  } catch {
    return {};
  }
}

export async function readStorefrontSettingsRow(shop: string): Promise<{
  syncInterval: string;
  translationsString: string | null;
}> {
  const rows = await prisma.$queryRaw<
    Array<{
      syncInterval: string;
      translationsString: string;
    }>
  >`
    SELECT
      "syncInterval",
      "translationsString"
    FROM "VolumeDiscountSettings"
    WHERE "shop" = ${shop}
    LIMIT 1
  `;

  return {
    syncInterval: rows[0]?.syncInterval ?? "disabled",
    translationsString: rows[0]?.translationsString ?? null,
  };
}

export async function loadStorefrontTranslationsForShop(
  shop: string,
): Promise<StorefrontTranslationsMap> {
  const memKey = `sf-translations:${shop}`;
  const cached = getMemoryCachedJson(memKey);
  if (cached) {
    try {
      return JSON.parse(cached) as StorefrontTranslationsMap;
    } catch {
      /* fall through */
    }
  }

  const row = await readStorefrontSettingsRow(shop);
  const stored = parseStoredStorefrontTranslations(row.translationsString);
  const languageKeys = Object.keys(stored);
  if (languageKeys.length === 0) {
    setMemoryCachedJson(memKey, "{}", 60_000);
    return {};
  }
  const built = buildStorefrontTranslationsForLanguages(languageKeys, stored);
  setMemoryCachedJson(memKey, JSON.stringify(built), 60_000);
  return built;
}

export function parseTranslationsFromWidgetPayload(
  payload: unknown,
): StorefrontTranslationsMap {
  if (!payload) return {};
  try {
    const parsed =
      typeof payload === "string" ? JSON.parse(payload) : payload;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const translations = (parsed as { translations?: unknown }).translations;
    if (
      !translations ||
      typeof translations !== "object" ||
      Array.isArray(translations)
    ) {
      return {};
    }
    return translations as StorefrontTranslationsMap;
  } catch {
    return {};
  }
}

export async function persistStorefrontTranslations(
  shop: string,
  translations: StorefrontTranslationsMap,
  syncInterval = "disabled",
): Promise<void> {
  const translationsString = JSON.stringify(translations);

  await prisma.$executeRaw`
    INSERT INTO "VolumeDiscountSettings" (
      "shop",
      "syncInterval",
      "translationsString",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${shop},
      ${syncInterval},
      ${translationsString},
      NOW(),
      NOW()
    )
    ON CONFLICT ("shop") DO UPDATE
    SET
      "syncInterval" = ${syncInterval},
      "translationsString" = ${translationsString},
      "updatedAt" = NOW()
  `;
  invalidateMemoryCachePrefix(`sf-translations:${shop}`);
}

/**
 * Ensures every enabled Shopify store language has a stored translation sheet.
 * Persists automatically when languages are added/removed in Shopify.
 */
export async function syncStorefrontTranslationsWithShopLanguages(
  shop: string,
  admin: AdminGraphql,
  options: {
    existingTranslations?: StorefrontTranslationsMap;
    syncInterval?: string;
    shopLanguages?: ShopLanguageOption[];
    /** Skip MyMemory calls — use for fast GET loaders; backfill after response. */
    skipAutoTranslate?: boolean;
  } = {},
): Promise<{
  translations: StorefrontTranslationsMap;
  shopLanguages: ShopLanguageOption[];
  persisted: boolean;
  addedLanguages: string[];
  needsAutoTranslate: boolean;
}> {
  const shopLanguages =
    options.shopLanguages ??
    (await fetchShopPublishedLocales(admin)).languages;
  const resolvedShopLanguages =
    shopLanguages.length > 0 ? shopLanguages : FALLBACK_SHOP_LANGUAGES;
  const languageKeys = languageKeysFromShopLanguages(resolvedShopLanguages);
  const existingTranslations = options.existingTranslations ?? {};
  const translations = buildStorefrontTranslationsForLanguages(
    languageKeys,
    existingTranslations,
  );

  const primaryLang =
    resolvedShopLanguages.find((language) => language.primary)?.value ??
    languageKeys[0] ??
    "en";
  const primarySource = resolveEnglishSourceForAutoTranslate(
    translations,
    primaryLang,
  );
  let tierStringsBackfilled = false;
  let cartBadgeStringsBackfilled = false;
  let needsAutoTranslate = false;

  for (const key of languageKeys) {
    const fields = translations[key];
    if (!fields) continue;

    const needsTier = hasUntranslatedTierStrings(key, fields, primaryLang);
    const needsCartBadge = hasUntranslatedCartBadgeStrings(
      key,
      fields,
      primaryLang,
    );
    if (needsTier || needsCartBadge) {
      needsAutoTranslate = true;
    }

    if (options.skipAutoTranslate) {
      continue;
    }

    if (needsTier) {
      try {
        const tierStrings = await autoTranslateTierStrings(
          primarySource,
          key,
          primaryLang,
        );
        translations[key] = {
          ...fields,
          ...tierStrings,
        };
        tierStringsBackfilled = true;
      } catch (error) {
        console.error(
          `[storefrontTranslations] Failed tier-string backfill for ${key}`,
          error,
        );
      }
    }

    const current = translations[key];
    if (
      current &&
      hasUntranslatedCartBadgeStrings(key, current, primaryLang)
    ) {
      try {
        const cartBadgeStrings = await autoTranslateCartBadgeStrings(
          primarySource,
          key,
          primaryLang,
        );
        translations[key] = {
          ...current,
          ...cartBadgeStrings,
        };
        cartBadgeStringsBackfilled = true;
      } catch (error) {
        console.error(
          `[storefrontTranslations] Failed cart-badge backfill for ${key}`,
          error,
        );
      }
    }
  }

  const previousKeys = Object.keys(existingTranslations);
  const addedLanguages = languageKeys.filter((key) => !previousKeys.includes(key));
  const removedLanguages = previousKeys.filter((key) => !languageKeys.includes(key));
  const needsFieldBackfill = languageKeys.some((key) => {
    const merged = translations[key];
    const raw = existingTranslations[key];
    if (!merged || !raw) return true;
    return JSON.stringify(merged) !== JSON.stringify(raw);
  });
  const shouldPersist =
    previousKeys.length === 0 ||
    addedLanguages.length > 0 ||
    removedLanguages.length > 0 ||
    needsFieldBackfill ||
    tierStringsBackfilled ||
    cartBadgeStringsBackfilled;

  if (shouldPersist) {
    await persistStorefrontTranslations(
      shop,
      translations,
      options.syncInterval ?? "disabled",
    );
  }

  return {
    translations,
    shopLanguages: resolvedShopLanguages,
    persisted: shouldPersist,
    addedLanguages,
    needsAutoTranslate,
  };
}

/** True when the cart/checkout label uses template placeholders. */
export function isCartDiscountDisplayTemplate(displayName: string): boolean {
  return String(displayName ?? "").trim().includes("{{");
}

/**
 * When an offer's Cart & checkout display name changes, refresh the shop-wide
 * cart-badge translation sheet (primary source + auto-translate other locales).
 * Always rewrites locale cart badges from the primary template so FR/TA keep
 * the same placeholders (`{{ amount }}` vs `{{ discount }}`).
 */
export async function syncCartDiscountTranslationsFromDisplayName(
  shop: string,
  admin: AdminGraphql,
  displayName: string,
  options: { autoTranslate?: boolean } = {},
): Promise<{ updated: boolean; errors: string[] }> {
  const trimmed = String(displayName ?? "").trim();
  if (!isCartDiscountDisplayTemplate(trimmed)) {
    return { updated: false, errors: [] };
  }

  const settings = await readStorefrontSettingsRow(shop);
  const shopLanguages =
    (await fetchShopPublishedLocales(admin)).languages;
  const resolvedShopLanguages =
    shopLanguages.length > 0 ? shopLanguages : FALLBACK_SHOP_LANGUAGES;
  const languageKeys = languageKeysFromShopLanguages(resolvedShopLanguages);
  const primaryLang =
    resolvedShopLanguages.find((language) => language.primary)?.value ??
    languageKeys[0] ??
    "en";
  const existing = parseStoredStorefrontTranslations(
    settings.translationsString,
  );
  const translations = buildStorefrontTranslationsForLanguages(
    languageKeys,
    existing,
  );

  const primarySource = resolveEnglishSourceForAutoTranslate(
    translations,
    primaryLang,
  );
  const previousPrimary = String(
    translations[primaryLang]?.transCartDiscount ?? "",
  ).trim();
  primarySource.transCartDiscount = trimmed;

  const primaryFields = translations[primaryLang] ?? primarySource;
  translations[primaryLang] = { ...primaryFields, transCartDiscount: trimmed };

  const errors: string[] = [];
  // Cart-badge locale templates must always track Display name placeholders.
  // Plan flag only gates machine-translate for non-curated languages.
  const allowMachineTranslate = options.autoTranslate !== false;

  for (const key of languageKeys) {
    if (key === primaryLang) continue;
    const fields = translations[key];
    if (!fields) continue;
    try {
      if (hasCuratedTranslationPreset(key)) {
        const cartBadgeStrings = await autoTranslateCartBadgeStrings(
          primarySource,
          key,
          primaryLang,
        );
        translations[key] = {
          ...fields,
          ...cartBadgeStrings,
        };
      } else if (allowMachineTranslate) {
        const cartBadgeStrings = await autoTranslateCartBadgeStrings(
          primarySource,
          key,
          primaryLang,
        );
        translations[key] = {
          ...fields,
          ...cartBadgeStrings,
        };
      } else {
        // No machine translate: still adapt placeholders when possible.
        translations[key] = {
          ...fields,
          transCartDiscount: trimmed,
        };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Translation failed";
      errors.push(`${key}: ${message}`);
      // Safe fallback — keep placeholders, avoid blanking the field.
      translations[key] = {
        ...fields,
        transCartDiscount: adaptCartDiscountTemplateForLanguage(trimmed, key),
      };
      console.error(
        `[storefrontTranslations] Cart badge auto-translate failed for ${key}`,
        error,
      );
    }
  }

  const changed =
    previousPrimary !== trimmed ||
    languageKeys.some((key) => {
      if (key === primaryLang) return previousPrimary !== trimmed;
      const before = existing[key]?.transCartDiscount?.trim() ?? "";
      const after = translations[key]?.transCartDiscount?.trim() ?? "";
      return before !== after;
    });

  if (!changed) {
    return { updated: false, errors };
  }

  await persistStorefrontTranslations(
    shop,
    translations,
    settings.syncInterval,
  );
  invalidateMemoryCachePrefix(`widget:${shop}:`);
  invalidateMemoryCachePrefix(`cart-rules:${shop}:`);
  invalidateMemoryCachePrefix(`sf-translations:${shop}`);

  return { updated: true, errors };
}

export type CampaignAutoTranslateActionResult =
  | {
      ok: true;
      intent: "autoTranslateCampaign";
      targetLang: string;
      fields: StorefrontTranslationFields;
      tierCopy: TierCopyFields[];
      message: string;
    }
  | {
      ok: false;
      intent: "autoTranslateCampaign";
      error: string;
    };

/**
 * Offer-editor Auto translate: translate primary-language source → target locale fields.
 * Does not persist; client applies overrides then merchant Saves the offer.
 */
export async function runCampaignAutoTranslateFromForm(
  shop: string,
  form: FormData,
): Promise<CampaignAutoTranslateActionResult> {
  const { resolveShopPlanContext } = await import("./shopPlan.server");
  const { upgradeMessage } = await import("./pricingPlans");

  const { capabilities } = await resolveShopPlanContext(shop);
  if (!capabilities.translations) {
    return {
      ok: false,
      intent: "autoTranslateCampaign",
      error: upgradeMessage("translations"),
    };
  }

  const targetLang = String(form.get("targetLang") ?? "")
    .trim()
    .toLowerCase();
  if (!targetLang) {
    return {
      ok: false,
      intent: "autoTranslateCampaign",
      error: "Select a language to auto-translate",
    };
  }

  const sourceLang =
    String(form.get("sourceLang") ?? "en").trim().toLowerCase() || "en";
  if (targetLang === sourceLang) {
    return {
      ok: false,
      intent: "autoTranslateCampaign",
      error: "Storefront primary language is the source language",
    };
  }

  let primarySource: StorefrontTranslationFields = {
    ...ENGLISH_STOREFRONT_TRANSLATION,
  };
  try {
    const parsed = JSON.parse(String(form.get("englishSource") ?? "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const field of STOREFRONT_TRANSLATION_FIELD_KEYS) {
        const value = (parsed as Record<string, unknown>)[field];
        if (typeof value === "string" && value.trim()) {
          primarySource[field] = value.trim();
        }
      }
    }
  } catch {
    return {
      ok: false,
      intent: "autoTranslateCampaign",
      error: "Invalid primary-language source for auto-translate",
    };
  }

  let primaryTiers: Array<{
    buyLabelText?: string;
    optionSubtext?: string;
    badge?: string;
  }> = [];
  try {
    const parsedTiers = JSON.parse(String(form.get("englishTiers") ?? "[]"));
    if (Array.isArray(parsedTiers)) {
      primaryTiers = parsedTiers.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          return { buyLabelText: "", optionSubtext: "", badge: "" };
        }
        const o = row as Record<string, unknown>;
        return {
          buyLabelText:
            typeof o.buyLabelText === "string" ? o.buyLabelText : "",
          optionSubtext:
            typeof o.optionSubtext === "string" ? o.optionSubtext : "",
          badge: typeof o.badge === "string" ? o.badge : "",
        };
      });
    }
  } catch {
    primaryTiers = [];
  }

  try {
    const [fields, tierCopy] = await Promise.all([
      autoTranslateStorefrontFields(primarySource, targetLang, sourceLang),
      autoTranslateTierCopyFields(primaryTiers, targetLang, sourceLang),
    ]);
    const sparse = sparsifyStorefrontTranslations({ [targetLang]: fields });
    const out: StorefrontTranslationFields = {
      ...fields,
      ...(sparse[targetLang] ?? {}),
    };
    return {
      ok: true,
      intent: "autoTranslateCampaign",
      targetLang,
      fields: out,
      tierCopy,
      message: `Auto-translated to ${targetLang.toUpperCase()} — Save the offer to apply`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auto-translate failed";
    return {
      ok: false,
      intent: "autoTranslateCampaign",
      error: message,
    };
  }
}
