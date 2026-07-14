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

export function parseSessionScopes(scope: string | null | undefined): string[] {
  return (scope ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAccessDeniedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("access denied") ||
    lower.includes("access_denied") ||
    (lower.includes("read_locales") && lower.includes("missing")) ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    /status code 40[13]/.test(lower)
  );
}

async function messageFromThrown(error: unknown): Promise<{
  message: string;
  missingLocaleScope: boolean;
}> {
  if (error instanceof Response) {
    try {
      const body = (await error.clone().json()) as {
        errors?: unknown;
        message?: string;
      };
      const raw =
        typeof body.errors === "string"
          ? body.errors
          : Array.isArray(body.errors)
            ? body.errors
                .map((e) =>
                  typeof e === "string"
                    ? e
                    : e && typeof e === "object" && "message" in e
                      ? String((e as { message: unknown }).message)
                      : JSON.stringify(e),
                )
                .join("; ")
            : body.errors
              ? JSON.stringify(body.errors)
              : body.message || `Shopify API error (${error.status})`;
      return {
        message: raw || `Shopify API error (${error.status})`,
        missingLocaleScope:
          error.status === 403 || isAccessDeniedMessage(raw),
      };
    } catch {
      return {
        message: `Shopify API error (${error.status || "unknown"})`,
        missingLocaleScope: error.status === 403,
      };
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message || "Failed to fetch shop locales",
      missingLocaleScope: isAccessDeniedMessage(error.message),
    };
  }

  return {
    message: "Failed to fetch shop locales",
    missingLocaleScope: false,
  };
}

export const FALLBACK_SHOP_LANGUAGES: ShopLanguageOption[] = [
  {
    label: "English (EN) — Primary",
    value: "en",
    locale: "en",
    primary: true,
  },
];

/**
 * Returns languages enabled on the merchant's Shopify store.
 * Requires `read_locales` (or `read_markets_home`) Admin API scope.
 */
const localesCache = new Map<
  string,
  {
    languages: ShopLanguageOption[];
    errors: string[];
    missingLocaleScope: boolean;
    expiresAt: number;
  }
>();
const LOCALES_TTL_MS = 10 * 60 * 1000;

export async function fetchShopPublishedLocales(
  admin: AdminGraphql,
  cacheKey = "default",
): Promise<{
  languages: ShopLanguageOption[];
  errors: string[];
  missingLocaleScope: boolean;
}> {
  const cached = localesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      languages: cached.languages,
      errors: cached.errors,
      missingLocaleScope: cached.missingLocaleScope,
    };
  }

  const errors: string[] = [];
  let missingLocaleScope = false;

  try {
    const response = await admin.graphql(SHOP_ENABLED_LOCALES_QUERY);
    const json = (await response.json()) as {
      errors?: Array<{ message: string }>;
      data?: { shopLocales?: ShopLocaleNode[] };
    };

    if (json.errors?.length) {
      const messages = json.errors.map((e) => e.message).filter(Boolean);
      errors.push(...messages);
      missingLocaleScope = messages.some(isAccessDeniedMessage);
      // Degrade gracefully so Settings stays usable.
      return {
        languages: [...FALLBACK_SHOP_LANGUAGES],
        errors,
        missingLocaleScope,
      };
    }

    const shopLocales = json.data?.shopLocales ?? [];
    if (!Array.isArray(shopLocales) || shopLocales.length === 0) {
      return {
        languages: [...FALLBACK_SHOP_LANGUAGES],
        errors,
        missingLocaleScope: false,
      };
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
      missingLocaleScope: false,
      expiresAt: Date.now() + LOCALES_TTL_MS,
    });

    return { languages, errors, missingLocaleScope: false };
  } catch (e) {
    // Shopify app auth redirect / scope-request Responses must bubble up.
    if (e instanceof Response && e.status >= 300 && e.status < 400) {
      throw e;
    }

    const parsed = await messageFromThrown(e);
    console.error("[shopPublishedLocales] Failed to fetch shop locales", e);
    return {
      languages: [...FALLBACK_SHOP_LANGUAGES],
      errors: [parsed.message],
      missingLocaleScope: parsed.missingLocaleScope,
    };
  }
}
