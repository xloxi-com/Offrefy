/**
 * Admin UI language for the Offrefy embedded app (Polaris + app chrome).
 * Completely separate from storefront widget translations.
 */

export const ADMIN_LANGUAGE_AUTO = "auto";

/** Europe-first ordering; Polaris-supported locales only. */
export const ADMIN_LANGUAGE_OPTIONS = [
  { label: "Auto (match Shopify Admin)", value: ADMIN_LANGUAGE_AUTO },
  { label: "English", value: "en" },
  // Western / Southern Europe
  { label: "Deutsch", value: "de" },
  { label: "Français", value: "fr" },
  { label: "Español", value: "es" },
  { label: "Italiano", value: "it" },
  { label: "Português (Portugal)", value: "pt-PT" },
  { label: "Nederlands", value: "nl" },
  // Northern Europe
  { label: "Svenska", value: "sv" },
  { label: "Dansk", value: "da" },
  { label: "Norsk bokmål", value: "nb" },
  { label: "Suomi", value: "fi" },
  // Central / Eastern Europe
  { label: "Polski", value: "pl" },
  { label: "Čeština", value: "cs" },
  { label: "Türkçe", value: "tr" },
  // Americas / other Polaris locales
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "日本語", value: "ja" },
  { label: "한국어", value: "ko" },
  { label: "ไทย", value: "th" },
  { label: "Tiếng Việt", value: "vi" },
  { label: "中文 (简体)", value: "zh-CN" },
  { label: "中文 (繁體)", value: "zh-TW" },
] as const;

export type AdminLanguageCode =
  (typeof ADMIN_LANGUAGE_OPTIONS)[number]["value"];

const SUPPORTED = new Set<string>(
  ADMIN_LANGUAGE_OPTIONS.map((o) => o.value),
);

/** Polaris ships locale JSON under these exact filenames. */
const POLARIS_LOCALE_FILES = new Set([
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "it",
  "ja",
  "ko",
  "nb",
  "nl",
  "pl",
  "pt-BR",
  "pt-PT",
  "sv",
  "th",
  "tr",
  "vi",
  "zh-CN",
  "zh-TW",
]);

export function isAdminLanguageCode(value: unknown): value is AdminLanguageCode {
  return typeof value === "string" && SUPPORTED.has(value);
}

export function normalizeAdminLanguage(
  value: string | null | undefined,
): AdminLanguageCode {
  if (isAdminLanguageCode(value)) return value;
  return ADMIN_LANGUAGE_AUTO;
}

/**
 * Map an IETF BCP 47 tag (e.g. Shopify Admin `en-US`, `fr-FR`) to a Polaris
 * locale file key. Prefer European variants where Polaris supports them.
 */
export function shopifyLocaleToPolarisKey(locale: string | null | undefined): string {
  if (!locale || typeof locale !== "string") return "en";
  const raw = locale.trim();
  if (!raw) return "en";

  if (POLARIS_LOCALE_FILES.has(raw)) return raw;

  const lower = raw.toLowerCase().replace(/_/g, "-");

  // Portuguese: Europe vs Brazil
  if (lower.startsWith("pt-br") || lower === "pt-br") return "pt-BR";
  if (
    lower.startsWith("pt-pt") ||
    lower.startsWith("pt-ao") ||
    lower.startsWith("pt-mz") ||
    lower === "pt"
  ) {
    return "pt-PT";
  }

  // Chinese
  if (lower.startsWith("zh-tw") || lower.startsWith("zh-hant") || lower.startsWith("zh-hk")) {
    return "zh-TW";
  }
  if (lower.startsWith("zh")) return "zh-CN";

  // Norwegian / Scandinavian aliases
  if (lower.startsWith("nb") || lower.startsWith("nn") || lower.startsWith("no")) {
    return "nb";
  }

  // European Shopify Admin locales → Polaris file (or nearest when Polaris has none)
  const europeanBaseAliases: Record<string, string> = {
    // Direct Polaris Europe packs
    de: "de",
    fr: "fr",
    es: "es",
    ca: "es", // Catalan (Andorra / Spain) → Español
    it: "it",
    nl: "nl",
    pl: "pl",
    cs: "cs",
    sk: "cs", // Slovak → Czech (closest Polaris pack)
    da: "da",
    sv: "sv",
    fi: "fi",
    tr: "tr",
    en: "en",
    // Regional / related without a dedicated Polaris pack
    lb: "de", // Luxembourgish → Deutsch
    rm: "de", // Romansh → Deutsch
    gsw: "de", // Swiss German → Deutsch
    cy: "en", // Welsh → English
    ga: "en", // Irish → English
    gd: "en", // Scottish Gaelic → English
    mt: "en", // Maltese → English
    is: "en", // Icelandic → English
  };

  const base = raw.split(/[-_]/)[0]?.toLowerCase() ?? "en";
  if (europeanBaseAliases[base] && POLARIS_LOCALE_FILES.has(europeanBaseAliases[base])) {
    return europeanBaseAliases[base];
  }
  if (POLARIS_LOCALE_FILES.has(base)) return base;

  return "en";
}

/**
 * Resolve which Polaris locale file to load.
 * `auto` follows the Shopify Admin user locale when provided.
 */
export function resolvePolarisLocaleKey(
  adminLanguage: string | null | undefined,
  shopifyAdminLocale?: string | null,
): string {
  const preferred = normalizeAdminLanguage(adminLanguage);
  if (preferred === ADMIN_LANGUAGE_AUTO) {
    return shopifyLocaleToPolarisKey(shopifyAdminLocale);
  }
  return shopifyLocaleToPolarisKey(preferred);
}

export const ADMIN_LANGUAGE_COOKIE = "offrefy_admin_language";
export const ADMIN_LANGUAGE_STORAGE_KEY = "offrefy-admin-language";

export function readAdminLanguageCookie(
  cookieHeader: string | null,
): AdminLanguageCode | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${ADMIN_LANGUAGE_COOKIE}=([^;]*)`),
  );
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    return isAdminLanguageCode(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function adminLanguageCookieHeader(value: AdminLanguageCode): string {
  const maxAge = 60 * 60 * 24 * 365;
  return `${ADMIN_LANGUAGE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}
