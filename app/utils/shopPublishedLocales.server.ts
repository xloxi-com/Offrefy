type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type ShopLanguageOption = {
  label: string;
  value: string;
  locale: string;
  primary: boolean;
};

const SHOP_ENABLED_LOCALES_QUERY = `#graphql
  query getShopEnabledLocales {
    shopLocales {
      locale
      name
      primary
      published
    }
  }
`;

type ShopLocaleNode = {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
};

/** Base language code used by storefront widget translation keys (e.g. "en" from "en-CA"). */
export function shopLocaleToTranslationKey(locale: string): string {
  return locale.split("-")[0].toLowerCase();
}

function formatShopLanguageOption(sl: ShopLocaleNode): ShopLanguageOption {
  const translationKey = shopLocaleToTranslationKey(sl.locale);
  const statusSuffix = sl.primary
    ? " — Primary"
    : sl.published
      ? ""
      : " — Unpublished";
  return {
    label: `${sl.name} (${sl.locale.toUpperCase()})${statusSuffix}`,
    value: translationKey,
    locale: sl.locale,
    primary: sl.primary,
  };
}

/**
 * Returns languages enabled on the merchant's Shopify store.
 * Requires `read_locales` (or `read_markets_home`) Admin API scope.
 */
const localesCache = new Map<
  string,
  { languages: ShopLanguageOption[]; errors: string[]; expiresAt: number }
>();
const LOCALES_TTL_MS = 10 * 60 * 1000;

export async function fetchShopPublishedLocales(
  admin: AdminGraphql,
  cacheKey = "default",
): Promise<{ languages: ShopLanguageOption[]; errors: string[] }> {
  const cached = localesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { languages: cached.languages, errors: cached.errors };
  }

  const errors: string[] = [];

  try {
    const response = await admin.graphql(SHOP_ENABLED_LOCALES_QUERY);
    const json = (await response.json()) as {
      errors?: Array<{ message: string }>;
      data?: { shopLocales?: ShopLocaleNode[] };
    };

    if (json.errors?.length) {
      errors.push(...json.errors.map((e) => e.message));
      return { languages: [], errors };
    }

    const shopLocales = json.data?.shopLocales ?? [];
    if (!Array.isArray(shopLocales) || shopLocales.length === 0) {
      return { languages: [], errors };
    }

    const sortedLocales = [...shopLocales].sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      if (a.published !== b.published) return a.published ? -1 : 1;
      return a.locale.localeCompare(b.locale);
    });

    const byTranslationKey = new Map<string, ShopLanguageOption>();
    for (const sl of sortedLocales) {
      const option = formatShopLanguageOption(sl);
      if (!byTranslationKey.has(option.value)) {
        byTranslationKey.set(option.value, option);
      }
    }

    const languages = Array.from(byTranslationKey.values());
    languages.sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    localesCache.set(cacheKey, {
      languages,
      errors,
      expiresAt: Date.now() + LOCALES_TTL_MS,
    });

    return { languages, errors };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch shop locales";
    console.error("[shopPublishedLocales] Failed to fetch shop locales", e);
    return { languages: [], errors: [message] };
  }
}

export const FALLBACK_SHOP_LANGUAGES: ShopLanguageOption[] = [
  {
    label: "English (EN) — Primary",
    value: "en",
    locale: "en",
    primary: true,
  },
];
