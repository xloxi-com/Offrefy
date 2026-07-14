import { prisma } from "../db.server";
import {
  buildStorefrontTranslationsForLanguages,
  type StorefrontTranslationsMap,
} from "./storefrontTranslations";
import {
  FALLBACK_SHOP_LANGUAGES,
  fetchShopPublishedLocales,
  type ShopLanguageOption,
} from "./shopPublishedLocales.server";
import {
  autoTranslateCartBadgeStrings,
  autoTranslateTierStrings,
  hasUntranslatedCartBadgeStrings,
  hasUntranslatedTierStrings,
  resolveEnglishSourceForAutoTranslate,
} from "./storefrontAutoTranslate.server";
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

  const englishSource = resolveEnglishSourceForAutoTranslate(translations);
  let tierStringsBackfilled = false;
  let cartBadgeStringsBackfilled = false;
  let needsAutoTranslate = false;

  for (const key of languageKeys) {
    const fields = translations[key];
    if (!fields) continue;

    const needsTier = hasUntranslatedTierStrings(key, fields);
    const needsCartBadge = hasUntranslatedCartBadgeStrings(key, fields);
    if (needsTier || needsCartBadge) {
      needsAutoTranslate = true;
    }

    if (options.skipAutoTranslate) {
      continue;
    }

    if (needsTier) {
      try {
        const tierStrings = await autoTranslateTierStrings(englishSource, key);
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
      hasUntranslatedCartBadgeStrings(key, current)
    ) {
      try {
        const cartBadgeStrings = await autoTranslateCartBadgeStrings(
          englishSource,
          key,
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
