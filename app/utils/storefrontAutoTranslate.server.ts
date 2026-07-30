import {
  ENGLISH_STOREFRONT_TRANSLATION,
  STOREFRONT_TRANSLATION_FIELD_KEYS,
  adaptCartDiscountTemplateForLanguage,
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
  primaryLang = "en",
): boolean {
  const key = languageKey.trim().toLowerCase();
  const primary = primaryLang.trim().toLowerCase() || "en";
  if (!key || key === primary) return false;
  return (
    fields.transCartDiscount.trim() === ENGLISH_CART_BADGE_STRINGS.transCartDiscount ||
    fields.transCartDiscountQty.trim() === ENGLISH_CART_BADGE_STRINGS.transCartDiscountQty
  );
}

export function hasUntranslatedTierStrings(
  languageKey: string,
  fields: StorefrontTranslationFields,
  primaryLang = "en",
): boolean {
  const key = languageKey.trim().toLowerCase();
  const primary = primaryLang.trim().toLowerCase() || "en";
  if (!key || key === primary) return false;
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

  const usePresetDiscount =
    hasCuratedTranslationPreset(to) &&
    source.transCartDiscount.trim() ===
      ENGLISH_CART_BADGE_STRINGS.transCartDiscount;
  const usePresetQty =
    hasCuratedTranslationPreset(to) &&
    source.transCartDiscountQty.trim() ===
      ENGLISH_CART_BADGE_STRINGS.transCartDiscountQty;
  const preset = hasCuratedTranslationPreset(to)
    ? translationPresetForLanguage(to)
    : null;

  let transCartDiscount: string;
  if (usePresetDiscount) {
    transCartDiscount = preset!.transCartDiscount;
  } else if (hasCuratedTranslationPreset(to)) {
    const adapted = adaptCartDiscountTemplateForLanguage(
      source.transCartDiscount,
      to,
    );
    transCartDiscount =
      adapted !== source.transCartDiscount.trim()
        ? adapted
        : await translateTemplateWithPlaceholders(
            source.transCartDiscount,
            from,
            to,
          );
  } else {
    transCartDiscount = await translateTemplateWithPlaceholders(
      source.transCartDiscount,
      from,
      to,
    );
  }

  return {
    transCartDiscount,
    transCartDiscountQty: usePresetQty
      ? preset!.transCartDiscountQty
      : await translateTemplateWithPlaceholders(
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
 * Auto-translate storefront widget copy from the shop primary language into the target.
 * - Unchanged primary/default starter copy → curated preset (when available).
 * - Merchant-edited primary fields (e.g. custom Widget Heading) → translate that text.
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

  const sourceDefaults =
    from === "en" || !hasCuratedTranslationPreset(from)
      ? ENGLISH_STOREFRONT_TRANSLATION
      : translationPresetForLanguage(from);
  const preset = hasCuratedTranslationPreset(to)
    ? translationPresetForLanguage(to)
    : null;
  const result = { ...source };
  const failures: string[] = [];

  for (const field of STOREFRONT_TRANSLATION_FIELD_KEYS) {
    const value = String(source[field] ?? "").trim();
    const isDefaultSource =
      value === sourceDefaults[field] ||
      value === ENGLISH_STOREFRONT_TRANSLATION[field] ||
      value === "";

    try {
      if (field === "transCartDiscount") {
        if (isDefaultSource && preset) {
          result[field] = preset.transCartDiscount;
        } else if (preset && /\{\{\s*(discount|amount)\s*\}\}/i.test(value)) {
          const adapted = adaptCartDiscountTemplateForLanguage(value, to);
          result[field] =
            adapted !== value
              ? adapted
              : await translateTemplateWithPlaceholders(value, from, to);
        } else {
          result[field] = await translateTemplateWithPlaceholders(
            value || sourceDefaults.transCartDiscount,
            from,
            to,
          );
        }
        continue;
      }

      if (field === "transCartDiscountQty") {
        if (isDefaultSource && preset) {
          result[field] = preset.transCartDiscountQty;
        } else {
          result[field] = await translateTemplateWithPlaceholders(
            value || sourceDefaults.transCartDiscountQty,
            from,
            to,
          );
        }
        continue;
      }

      // Default starter copy → curated preset when we have one.
      if (isDefaultSource && preset) {
        result[field] = preset[field];
        continue;
      }

      // Merchant customized primary-language text → translate that exact string.
      const toTranslate = value || sourceDefaults[field];
      result[field] = /\{\{\s*\w+\s*\}\}/.test(toTranslate)
        ? await translateTemplateWithPlaceholders(toTranslate, from, to)
        : await translateTextWithMyMemory(toTranslate, from, to);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Translation request failed";
      failures.push(`${field}: ${message}`);
      result[field] =
        preset?.[field] ?? source[field] ?? sourceDefaults[field];
    }
  }

  if (failures.length === STOREFRONT_TRANSLATION_FIELD_KEYS.length) {
    throw new Error(failures[0] ?? "Auto-translate failed");
  }

  return result;
}

/** Resolve the shop primary-language sheet used as Auto translate source. */
export function resolveEnglishSourceForAutoTranslate(
  translations: Partial<Record<string, Partial<StorefrontTranslationFields>>>,
  primaryLang = "en",
): StorefrontTranslationFields {
  const primary = primaryLang.trim().toLowerCase() || "en";
  const basePreset =
    primary === "en" || !hasCuratedTranslationPreset(primary)
      ? ENGLISH_STOREFRONT_TRANSLATION
      : translationPresetForLanguage(primary);
  const sourceSheet = translations[primary];
  const merged: StorefrontTranslationFields = {
    ...basePreset,
    ...(sourceSheet ?? {}),
  };

  for (const field of STOREFRONT_TRANSLATION_FIELD_KEYS) {
    if (!merged[field] || String(merged[field]).trim() === "") {
      merged[field] = basePreset[field];
    }
  }

  return merged;
}

export type TierCopyTranslateInput = {
  buyLabelText?: string;
  optionSubtext?: string;
  badge?: string;
};

/**
 * Translate Rules-tab tier option label / subtext / badge into the target language.
 * Empty primary-language fields stay empty (storefront keeps auto “Buy …” via transBuy).
 */
export async function autoTranslateTierCopyFields(
  sourceTiers: TierCopyTranslateInput[],
  targetLang: string,
  sourceLang = "en",
): Promise<
  Array<{ buyLabelText: string; optionSubtext: string; badge: string }>
> {
  const from = normalizeLanguageCode(sourceLang);
  const to = normalizeLanguageCode(targetLang);
  if (!to || to === from) {
    return sourceTiers.map((row) => ({
      buyLabelText: String(row?.buyLabelText ?? "").trim(),
      optionSubtext: String(row?.optionSubtext ?? "").trim(),
      badge: String(row?.badge ?? "").trim(),
    }));
  }

  const out: Array<{
    buyLabelText: string;
    optionSubtext: string;
    badge: string;
  }> = [];

  for (const row of sourceTiers) {
    const buyLabelText = String(row?.buyLabelText ?? "").trim();
    const optionSubtext = String(row?.optionSubtext ?? "").trim();
    const badge = String(row?.badge ?? "").trim();
    out.push({
      buyLabelText: buyLabelText
        ? await translateTextWithMyMemory(buyLabelText, from, to)
        : "",
      optionSubtext: optionSubtext
        ? await translateTextWithMyMemory(optionSubtext, from, to)
        : "",
      badge: badge ? await translateTextWithMyMemory(badge, from, to) : "",
    });
  }

  return out;
}
