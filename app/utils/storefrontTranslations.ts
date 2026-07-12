export type StorefrontTranslationFields = {
  transHeading: string;
  transQty: string;
  transDiscount: string;
  transPrice: string;
  transCountdown: string;
  transCta: string;
  transFootnote: string;
  /** Tier label prefix, e.g. "Buy" → "Buy 10" becomes "Achetez 10". */
  transBuy: string;
  /** Savings line prefix before the amount, e.g. "You save". */
  transYouSave: string;
  /** Tier "+ Add" button label. */
  transAdd: string;
  /** Cart / checkout discount badge template. {{ discount }} = tier %, {{ amount }} = line savings. */
  transCartDiscount: string;
  /** Quantity suffix on cart badge when qty is grouped, e.g. "(qty {{ qty }})". */
  transCartDiscountQty: string;
};

export type StorefrontTranslationsMap = Record<string, StorefrontTranslationFields>;

export const ENGLISH_STOREFRONT_TRANSLATION: StorefrontTranslationFields = {
  transHeading: "Buy more save more",
  transQty: "Qty",
  transDiscount: "Discount",
  transPrice: "Price / ea",
  transCountdown: "Sale ends in",
  transCta: "Add to cart",
  transFootnote: "Pick a tier to set quantity, then add to cart.",
  transBuy: "Buy",
  transYouSave: "You save",
  transAdd: "Add",
  transCartDiscount: "{{ discount }} OFF",
  transCartDiscountQty: "(qty {{ qty }})",
};

/** Starter copy for common storefront languages. Unknown codes fall back to English. */
export const STOREFRONT_TRANSLATION_PRESETS: StorefrontTranslationsMap = {
  en: ENGLISH_STOREFRONT_TRANSLATION,
  es: {
    transHeading: "Compre más, ahorre más",
    transQty: "Cant.",
    transDiscount: "Descuento",
    transPrice: "Precio / ud.",
    transCountdown: "La oferta termina en",
    transCta: "Añadir al carrito",
    transFootnote:
      "Elija un nivel para establecer la cantidad, luego añada al carrito.",
    transBuy: "Compre",
    transYouSave: "Ahorras",
    transAdd: "Añadir",
    transCartDiscount: "{{ discount }} DE DESCUENTO",
    transCartDiscountQty: "(cant. {{ qty }})",
  },
  fr: {
    transHeading: "Achetez plus, économisez plus",
    transQty: "Qté",
    transDiscount: "Remise",
    transPrice: "Prix / ch.",
    transCountdown: "La vente se termine dans",
    transCta: "Ajouter au panier",
    transFootnote:
      "Choisissez un niveau pour définir la quantité, puis ajoutez au panier.",
    transBuy: "Achetez",
    transYouSave: "Vous économisez",
    transAdd: "Ajouter",
    transCartDiscount: "{{ discount }} DE RÉDUCTION",
    transCartDiscountQty: "(qté {{ qty }})",
  },
  de: {
    transHeading: "Mehr kaufen, mehr sparen",
    transQty: "Menge",
    transDiscount: "Rabatt",
    transPrice: "Preis / Stk.",
    transCountdown: "Verkauf endet in",
    transCta: "In den Warenkorb",
    transFootnote:
      "Wählen Sie eine Stufe, um die Menge festzulegen, und legen Sie sie in den Warenkorb.",
    transBuy: "Kaufen",
    transYouSave: "Sie sparen",
    transAdd: "Hinzufügen",
    transCartDiscount: "{{ discount }} RABATT",
    transCartDiscountQty: "(Menge {{ qty }})",
  },
  ta: {
    transHeading: "அதிகமாக வாங்கி அதிகமாக சேமிக்கவும்",
    transQty: "அளவு",
    transDiscount: "தள்ளுபடி",
    transPrice: "விலை",
    transCountdown: "விற்பனை முடிவடைகிறது",
    transCta: "வண்டியில் சேர்",
    transFootnote:
      "அளவை அமைக்க ஒரு அடுக்கைத் தேர்வுசெய்து, பின்னர் வண்டியில் சேர்க்கவும்.",
    transBuy: "வாங்குங்கள்",
    transYouSave: "நீங்கள் சேமிக்கிறீர்கள்",
    transAdd: "சேர்",
    transCartDiscount: "{{ discount }} தள்ளுபடி",
    transCartDiscountQty: "(அளவு {{ qty }})",
  },
  nl: {
    transHeading: "Koop meer, bespaar meer",
    transQty: "Aantal",
    transDiscount: "Korting",
    transPrice: "Prijs / st.",
    transCountdown: "Uitverkoop eindigt over",
    transCta: "In winkelwagen",
    transFootnote:
      "Kies een niveau om de hoeveelheid in te stellen en voeg toe aan winkelwagen.",
    transBuy: "Koop",
    transYouSave: "Je bespaart",
    transAdd: "Toevoegen",
    transCartDiscount: "{{ discount }} KORTING",
    transCartDiscountQty: "(aantal {{ qty }})",
  },
};

export const STOREFRONT_TRANSLATION_FIELD_KEYS = Object.keys(
  ENGLISH_STOREFRONT_TRANSLATION,
) as (keyof StorefrontTranslationFields)[];

export function hasCuratedTranslationPreset(languageKey: string): boolean {
  const key = languageKey.trim().toLowerCase();
  return key !== "en" && Object.prototype.hasOwnProperty.call(STOREFRONT_TRANSLATION_PRESETS, key);
}

export function translationPresetForLanguage(
  languageKey: string,
): StorefrontTranslationFields {
  return (
    STOREFRONT_TRANSLATION_PRESETS[languageKey] ?? {
      ...ENGLISH_STOREFRONT_TRANSLATION,
    }
  );
}

function fillEmptyTranslationFields(
  languageKey: string,
  existing?: Partial<StorefrontTranslationFields>,
): StorefrontTranslationFields {
  const preset = translationPresetForLanguage(languageKey);
  const merged: StorefrontTranslationFields = {
    ...preset,
    ...(existing ?? {}),
  };
  for (const field of Object.keys(preset) as (keyof StorefrontTranslationFields)[]) {
    if (!merged[field] || String(merged[field]).trim() === "") {
      merged[field] = preset[field];
    }
  }
  return merged;
}

/** Build a translation sheet entry for each Shopify store language. */
export function buildStorefrontTranslationsForLanguages(
  languageKeys: string[],
  existing: StorefrontTranslationsMap = {},
): StorefrontTranslationsMap {
  const uniqueKeys = [...new Set(languageKeys.map((key) => key.trim().toLowerCase()).filter(Boolean))];
  const result: StorefrontTranslationsMap = {};

  for (const key of uniqueKeys) {
    result[key] = fillEmptyTranslationFields(key, existing[key]);
  }

  return result;
}

export function storefrontTranslationsEqual(
  left: StorefrontTranslationsMap,
  right: StorefrontTranslationsMap,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Compact cart-badge copy embedded in the Shopify discount function metafield. */
export type DiscountFunctionCartTranslations = Record<
  string,
  {
    cartDiscount: string;
    cartDiscountQty: string;
  }
>;

export function compactTranslationsForDiscountFunction(
  translations: StorefrontTranslationsMap,
): DiscountFunctionCartTranslations {
  const result: DiscountFunctionCartTranslations = {};
  for (const [lang, fields] of Object.entries(translations)) {
    const key = lang.trim().toLowerCase();
    if (!key) continue;

    let cartDiscount = fields.transCartDiscount.trim();
    let cartDiscountQty = fields.transCartDiscountQty.trim();

    if (
      key !== "en" &&
      cartDiscount === ENGLISH_STOREFRONT_TRANSLATION.transCartDiscount &&
      fields.transDiscount.trim()
    ) {
      cartDiscount = `{{ discount }} ${fields.transDiscount.trim()}`;
    }
    if (
      key !== "en" &&
      cartDiscountQty === ENGLISH_STOREFRONT_TRANSLATION.transCartDiscountQty &&
      fields.transQty.trim()
    ) {
      cartDiscountQty = `(${fields.transQty.trim()} {{ qty }})`;
    }

    result[key] = {
      cartDiscount,
      cartDiscountQty,
    };
  }
  return result;
}
