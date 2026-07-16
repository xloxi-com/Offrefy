import {
  ENGLISH_STOREFRONT_TRANSLATION,
  STOREFRONT_TRANSLATION_FIELD_KEYS,
  hasCuratedTranslationPreset,
  translationPresetForLanguage,
  type StorefrontTranslationFields,
} from "./storefrontTranslations";

const ENGLISH_TIER_STRINGS = {
  transBuy: ENGLISH_STOREFRONT_TRANSLATION.transBuy,
  transYouSave: ENGLISH_STOREFRONT_TRANSLATION.transYouSave,
  transAdd: ENGLISH_STOREFRONT_TRANSLATION.transAdd,
} as const;

const ENGLISH_CART_BADGE_STRINGS = {
  transCartDiscount: ENGLISH_STOREFRONT_TRANSLATION.transCartDiscount,
  transCartDiscountQty: ENGLISH_STOREFRONT_TRANSLATION.transCartDiscountQty,
} as const;

export function hasUntranslatedCartBadgeStrings(
  languageKey: string,
  fields: StorefrontTranslationFields,
): boolean {
  const key = languageKey.trim().toLowerCase();
  if (!key || key === "en") return false;
  return (
    fields.transCartDiscount.trim() === ENGLISH_CART_BADGE_STRINGS.transCartDiscount ||
    fields.transCartDiscountQty.trim() === ENGLISH_CART_BADGE_STRINGS.transCartDiscountQty
  );
}

export function hasUntranslatedTierStrings(
  languageKey: string,
  fields: StorefrontTranslationFields,
): boolean {
  const key = languageKey.trim().toLowerCase();
  if (!key || key === "en") return false;
  return (
    fields.transBuy.trim() === ENGLISH_TIER_STRINGS.transBuy ||
    fields.transYouSave.trim() === ENGLISH_TIER_STRINGS.transYouSave ||
    fields.transAdd.trim() === ENGLISH_TIER_STRINGS.transAdd
  );
}

export async function autoTranslateTierStrings(
  source: StorefrontTranslationFields,
  targetLang: string,
  sourceLang = "en",
): Promise<
  Pick<StorefrontTranslationFields, "transBuy" | "transYouSave" | "transAdd">
> {
  const from = normalizeLanguageCode(sourceLang);
  const to = normalizeLanguageCode(targetLang);
  if (!to || to === from) {
    return {
      transBuy: source.transBuy,
      transYouSave: source.transYouSave,
      transAdd: source.transAdd,
    };
  }

  if (hasCuratedTranslationPreset(to)) {
    const preset = translationPresetForLanguage(to);
    return {
      transBuy: preset.transBuy,
      transYouSave: preset.transYouSave,
      transAdd: preset.transAdd,
    };
  }

  return {
    transBuy: await translateTextWithMyMemory(source.transBuy, from, to),
    transYouSave: await translateTextWithMyMemory(source.transYouSave, from, to),
    transAdd: await translateTextWithMyMemory(source.transAdd, from, to),
  };
}

export async function autoTranslateCartBadgeStrings(
  source: StorefrontTranslationFields,
  targetLang: string,
  sourceLang = "en",
): Promise<
  Pick<StorefrontTranslationFields, "transCartDiscount" | "transCartDiscountQty">
> {
  const from = normalizeLanguageCode(sourceLang);
  const to = normalizeLanguageCode(targetLang);
  if (!to || to === from) {
    return {
      transCartDiscount: source.transCartDiscount,
      transCartDiscountQty: source.transCartDiscountQty,
    };
  }

  if (hasCuratedTranslationPreset(to)) {
    const preset = translationPresetForLanguage(to);
    return {
      transCartDiscount: preset.transCartDiscount,
      transCartDiscountQty: preset.transCartDiscountQty,
    };
  }

  return {
    transCartDiscount: await translateTemplateWithPlaceholders(
      source.transCartDiscount,
      from,
      to,
    ),
    transCartDiscountQty: await translateTemplateWithPlaceholders(
      source.transCartDiscountQty,
      from,
      to,
    ),
  };
}

async function translateTemplateWithPlaceholders(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const masked = String(text ?? "")
    .replace(/\{\{\s*discount\s*\}\}/gi, "@@DISCOUNT@@")
    .replace(/\{\{\s*qty\s*\}\}/gi, "@@QTY@@")
    .replace(/\{\{\s*amount\s*\}\}/gi, "@@AMOUNT@@");
  const translated = await translateTextWithMyMemory(masked, sourceLang, targetLang);
  return translated
    .replace(/@@DISCOUNT@@/gi, "{{ discount }}")
    .replace(/@@QTY@@/gi, "{{ qty }}")
    .replace(/@@AMOUNT@@/gi, "{{ amount }}");
}

type MyMemoryResponse = {
  responseData?: { translatedText?: string };
  responseStatus?: number;
  quotaFinished?: boolean;
  responseDetails?: string;
};

function normalizeLanguageCode(code: string): string {
  return code.trim().toLowerCase().split("-")[0];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function translateTextWithMyMemory(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";

  const params = new URLSearchParams({
    q: trimmed,
    langpair: `${sourceLang}|${targetLang}`,
  });
  const email = process.env.MYMEMORY_EMAIL?.trim();
  if (email) {
    params.set("de", email);
  }

  const response = await fetch(
    `https://api.mymemory.translated.net/get?${params.toString()}`,
    { signal: AbortSignal.timeout(20_000) },
  );

  if (!response.ok) {
    throw new Error(`Translation service unavailable (${response.status})`);
  }

  const json = (await response.json()) as MyMemoryResponse;
  if (json.quotaFinished) {
    throw new Error(
      "Daily auto-translate quota reached. Try again tomorrow or enter translations manually.",
    );
  }

  if (json.responseStatus && json.responseStatus !== 200) {
    throw new Error(
      json.responseDetails ||
        `Translation failed for "${trimmed.slice(0, 40)}..."`,
    );
  }

  const translated = decodeHtmlEntities(
    String(json.responseData?.translatedText ?? "").trim(),
  );
  if (!translated) {
    throw new Error(`No translation returned for "${trimmed.slice(0, 40)}..."`);
  }

  return translated;
}

/**
 * Auto-translate storefront widget copy from English into the target language.
 * Uses curated presets when available; otherwise calls MyMemory machine translation.
 */
export async function autoTranslateStorefrontFields(
  source: StorefrontTranslationFields,
  targetLang: string,
  sourceLang = "en",
): Promise<StorefrontTranslationFields> {
  const from = normalizeLanguageCode(sourceLang);
  const to = normalizeLanguageCode(targetLang);

  if (!to) {
    throw new Error("Target language is required");
  }
  if (to === from) {
    return { ...source };
  }

  if (hasCuratedTranslationPreset(to)) {
    return { ...translationPresetForLanguage(to) };
  }

  const result = { ...source };
  const failures: string[] = [];

  for (const field of STOREFRONT_TRANSLATION_FIELD_KEYS) {
    try {
      const value = source[field];
      result[field] = /\{\{\s*\w+\s*\}\}/.test(value)
        ? await translateTemplateWithPlaceholders(value, from, to)
        : await translateTextWithMyMemory(value, from, to);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Translation request failed";
      failures.push(`${field}: ${message}`);
      result[field] = source[field];
    }
  }

  if (failures.length === STOREFRONT_TRANSLATION_FIELD_KEYS.length) {
    throw new Error(failures[0] ?? "Auto-translate failed");
  }

  return result;
}

export function resolveEnglishSourceForAutoTranslate(
  translations: Partial<Record<string, Partial<StorefrontTranslationFields>>>,
): StorefrontTranslationFields {
  const english = translations.en;
  const merged: StorefrontTranslationFields = {
    ...ENGLISH_STOREFRONT_TRANSLATION,
    ...(english ?? {}),
  };

  for (const field of STOREFRONT_TRANSLATION_FIELD_KEYS) {
    if (!merged[field] || String(merged[field]).trim() === "") {
      merged[field] = ENGLISH_STOREFRONT_TRANSLATION[field];
    }
  }

  return merged;
}
