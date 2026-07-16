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

  // —— Western / Southern Europe ——
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
  ca: {
    transHeading: "Compra més, estalvia més",
    transQty: "Quant.",
    transDiscount: "Descompte",
    transPrice: "Preu / ud.",
    transCountdown: "L'oferta acaba en",
    transCta: "Afegeix al carretó",
    transFootnote:
      "Trieu un nivell per definir la quantitat i després afegiu-lo al carretó.",
    transBuy: "Compra",
    transYouSave: "Estalvies",
    transAdd: "Afegeix",
    transCartDiscount: "{{ discount }} DE DESCOMPTE",
    transCartDiscountQty: "(quant. {{ qty }})",
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
  it: {
    transHeading: "Compra di più, risparmia di più",
    transQty: "Qtà",
    transDiscount: "Sconto",
    transPrice: "Prezzo / cad.",
    transCountdown: "L'offerta termina tra",
    transCta: "Aggiungi al carrello",
    transFootnote:
      "Scegli un livello per impostare la quantità, poi aggiungi al carrello.",
    transBuy: "Compra",
    transYouSave: "Risparmi",
    transAdd: "Aggiungi",
    transCartDiscount: "{{ discount }} DI SCONTO",
    transCartDiscountQty: "(qtà {{ qty }})",
  },
  pt: {
    transHeading: "Compre mais, poupe mais",
    transQty: "Qtd.",
    transDiscount: "Desconto",
    transPrice: "Preço / un.",
    transCountdown: "A promoção termina em",
    transCta: "Adicionar ao carrinho",
    transFootnote:
      "Escolha um nível para definir a quantidade e adicione ao carrinho.",
    transBuy: "Compre",
    transYouSave: "Poupa",
    transAdd: "Adicionar",
    transCartDiscount: "{{ discount }} DE DESCONTO",
    transCartDiscountQty: "(qtd. {{ qty }})",
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

  // —— Northern Europe ——
  sv: {
    transHeading: "Köp mer, spara mer",
    transQty: "Antal",
    transDiscount: "Rabatt",
    transPrice: "Pris / st.",
    transCountdown: "Rean slutar om",
    transCta: "Lägg i varukorg",
    transFootnote:
      "Välj en nivå för att ange antal och lägg sedan i varukorgen.",
    transBuy: "Köp",
    transYouSave: "Du sparar",
    transAdd: "Lägg till",
    transCartDiscount: "{{ discount }} RABATT",
    transCartDiscountQty: "(antal {{ qty }})",
  },
  da: {
    transHeading: "Køb mere, spar mere",
    transQty: "Antal",
    transDiscount: "Rabat",
    transPrice: "Pris / stk.",
    transCountdown: "Tilbuddet slutter om",
    transCta: "Læg i kurv",
    transFootnote:
      "Vælg et niveau for at angive antal, og læg derefter i kurven.",
    transBuy: "Køb",
    transYouSave: "Du sparer",
    transAdd: "Tilføj",
    transCartDiscount: "{{ discount }} RABAT",
    transCartDiscountQty: "(antal {{ qty }})",
  },
  nb: {
    transHeading: "Kjøp mer, spar mer",
    transQty: "Antall",
    transDiscount: "Rabatt",
    transPrice: "Pris / stk.",
    transCountdown: "Salget slutter om",
    transCta: "Legg i handlekurv",
    transFootnote:
      "Velg et nivå for å angi antall, og legg deretter i handlekurven.",
    transBuy: "Kjøp",
    transYouSave: "Du sparer",
    transAdd: "Legg til",
    transCartDiscount: "{{ discount }} RABATT",
    transCartDiscountQty: "(antall {{ qty }})",
  },
  no: {
    transHeading: "Kjøp mer, spar mer",
    transQty: "Antall",
    transDiscount: "Rabatt",
    transPrice: "Pris / stk.",
    transCountdown: "Salget slutter om",
    transCta: "Legg i handlekurv",
    transFootnote:
      "Velg et nivå for å angi antall, og legg deretter i handlekurven.",
    transBuy: "Kjøp",
    transYouSave: "Du sparer",
    transAdd: "Legg til",
    transCartDiscount: "{{ discount }} RABATT",
    transCartDiscountQty: "(antall {{ qty }})",
  },
  fi: {
    transHeading: "Osta enemmän, säästä enemmän",
    transQty: "Määrä",
    transDiscount: "Alennus",
    transPrice: "Hinta / kpl",
    transCountdown: "Ale päättyy",
    transCta: "Lisää ostoskoriin",
    transFootnote:
      "Valitse taso määrän asettamiseksi ja lisää sitten ostoskoriin.",
    transBuy: "Osta",
    transYouSave: "Säästät",
    transAdd: "Lisää",
    transCartDiscount: "{{ discount }} ALE",
    transCartDiscountQty: "(määrä {{ qty }})",
  },

  // —— Central / Eastern Europe ——
  pl: {
    transHeading: "Kup więcej, oszczędzaj więcej",
    transQty: "Ilość",
    transDiscount: "Rabat",
    transPrice: "Cena / szt.",
    transCountdown: "Wyprzedaż kończy się za",
    transCta: "Dodaj do koszyka",
    transFootnote:
      "Wybierz poziom, aby ustawić ilość, a następnie dodaj do koszyka.",
    transBuy: "Kup",
    transYouSave: "Oszczędzasz",
    transAdd: "Dodaj",
    transCartDiscount: "{{ discount }} RABATU",
    transCartDiscountQty: "(ilość {{ qty }})",
  },
  cs: {
    transHeading: "Kupte více, ušetřete více",
    transQty: "Množ.",
    transDiscount: "Sleva",
    transPrice: "Cena / ks",
    transCountdown: "Akce končí za",
    transCta: "Přidat do košíku",
    transFootnote:
      "Vyberte úroveň pro nastavení množství a poté přidejte do košíku.",
    transBuy: "Kupte",
    transYouSave: "Ušetříte",
    transAdd: "Přidat",
    transCartDiscount: "{{ discount }} SLEVA",
    transCartDiscountQty: "(množ. {{ qty }})",
  },
  sk: {
    transHeading: "Kúpte viac, ušetrite viac",
    transQty: "Množ.",
    transDiscount: "Zľava",
    transPrice: "Cena / ks",
    transCountdown: "Akcia končí za",
    transCta: "Pridať do košíka",
    transFootnote:
      "Vyberte úroveň na nastavenie množstva a potom pridajte do košíka.",
    transBuy: "Kúpte",
    transYouSave: "Ušetríte",
    transAdd: "Pridať",
    transCartDiscount: "{{ discount }} ZĽAVA",
    transCartDiscountQty: "(množ. {{ qty }})",
  },
  hu: {
    transHeading: "Vásároljon többet, spóroljon többet",
    transQty: "Menny.",
    transDiscount: "Kedvezmény",
    transPrice: "Ár / db",
    transCountdown: "Az akció véget ér",
    transCta: "Kosárba",
    transFootnote:
      "Válasszon szintet a mennyiség beállításához, majd adja a kosárhoz.",
    transBuy: "Vásároljon",
    transYouSave: "Megtakarít",
    transAdd: "Hozzáad",
    transCartDiscount: "{{ discount }} KEDVEZMÉNY",
    transCartDiscountQty: "(menny. {{ qty }})",
  },
  ro: {
    transHeading: "Cumpără mai mult, economisește mai mult",
    transQty: "Cant.",
    transDiscount: "Reducere",
    transPrice: "Preț / buc.",
    transCountdown: "Oferta se termină în",
    transCta: "Adaugă în coș",
    transFootnote:
      "Alegeți un nivel pentru a seta cantitatea, apoi adăugați în coș.",
    transBuy: "Cumpără",
    transYouSave: "Economisești",
    transAdd: "Adaugă",
    transCartDiscount: "{{ discount }} REDUCERE",
    transCartDiscountQty: "(cant. {{ qty }})",
  },
  bg: {
    transHeading: "Купете повече, спестете повече",
    transQty: "Кол.",
    transDiscount: "Отстъпка",
    transPrice: "Цена / бр.",
    transCountdown: "Промоцията приключва след",
    transCta: "Добави в кошницата",
    transFootnote:
      "Изберете ниво, за да зададете количество, след което добавете в кошницата.",
    transBuy: "Купете",
    transYouSave: "Спестявате",
    transAdd: "Добави",
    transCartDiscount: "{{ discount }} ОТСТЪПКА",
    transCartDiscountQty: "(кол. {{ qty }})",
  },
  hr: {
    transHeading: "Kupite više, uštedite više",
    transQty: "Kol.",
    transDiscount: "Popust",
    transPrice: "Cijena / kom.",
    transCountdown: "Akcija završava za",
    transCta: "Dodaj u košaricu",
    transFootnote:
      "Odaberite razinu za postavljanje količine, zatim dodajte u košaricu.",
    transBuy: "Kupite",
    transYouSave: "Štedite",
    transAdd: "Dodaj",
    transCartDiscount: "{{ discount }} POPUST",
    transCartDiscountQty: "(kol. {{ qty }})",
  },
  sl: {
    transHeading: "Kupite več, prihranite več",
    transQty: "Kol.",
    transDiscount: "Popust",
    transPrice: "Cena / kos",
    transCountdown: "Akcija se konča čez",
    transCta: "Dodaj v košarico",
    transFootnote:
      "Izberite raven za nastavitev količine in nato dodajte v košarico.",
    transBuy: "Kupite",
    transYouSave: "Prihranite",
    transAdd: "Dodaj",
    transCartDiscount: "{{ discount }} POPUST",
    transCartDiscountQty: "(kol. {{ qty }})",
  },
  el: {
    transHeading: "Αγοράστε περισσότερα, εξοικονομήστε περισσότερα",
    transQty: "Ποσ.",
    transDiscount: "Έκπτωση",
    transPrice: "Τιμή / τεμ.",
    transCountdown: "Η προσφορά λήγει σε",
    transCta: "Προσθήκη στο καλάθι",
    transFootnote:
      "Επιλέξτε επίπεδο για ποσότητα και προσθέστε στο καλάθι.",
    transBuy: "Αγοράστε",
    transYouSave: "Εξοικονομείτε",
    transAdd: "Προσθήκη",
    transCartDiscount: "{{ discount }} ΈΚΠΤΩΣΗ",
    transCartDiscountQty: "(ποσ. {{ qty }})",
  },
  tr: {
    transHeading: "Daha fazla alın, daha fazla tasarruf edin",
    transQty: "Adet",
    transDiscount: "İndirim",
    transPrice: "Fiyat / ad.",
    transCountdown: "İndirim bitiyor",
    transCta: "Sepete ekle",
    transFootnote:
      "Miktarı ayarlamak için bir seviye seçin, ardından sepete ekleyin.",
    transBuy: "Alın",
    transYouSave: "Tasarrufunuz",
    transAdd: "Ekle",
    transCartDiscount: "{{ discount }} İNDİRİM",
    transCartDiscountQty: "(adet {{ qty }})",
  },
  uk: {
    transHeading: "Купуйте більше — економте більше",
    transQty: "К-сть",
    transDiscount: "Знижка",
    transPrice: "Ціна / шт.",
    transCountdown: "Акція закінчується через",
    transCta: "Додати до кошика",
    transFootnote:
      "Оберіть рівень, щоб встановити кількість, потім додайте до кошика.",
    transBuy: "Купуйте",
    transYouSave: "Ви економите",
    transAdd: "Додати",
    transCartDiscount: "{{ discount }} ЗНИЖКА",
    transCartDiscountQty: "(к-сть {{ qty }})",
  },
  ru: {
    transHeading: "Покупайте больше — экономьте больше",
    transQty: "Кол-во",
    transDiscount: "Скидка",
    transPrice: "Цена / шт.",
    transCountdown: "Акция заканчивается через",
    transCta: "В корзину",
    transFootnote:
      "Выберите уровень, чтобы задать количество, затем добавьте в корзину.",
    transBuy: "Купите",
    transYouSave: "Вы экономите",
    transAdd: "Добавить",
    transCartDiscount: "{{ discount }} СКИДКА",
    transCartDiscountQty: "(кол-во {{ qty }})",
  },
  lt: {
    transHeading: "Pirkite daugiau, sutaupykite daugiau",
    transQty: "Kiekis",
    transDiscount: "Nuolaida",
    transPrice: "Kaina / vnt.",
    transCountdown: "Akcija baigiasi po",
    transCta: "Į krepšelį",
    transFootnote:
      "Pasirinkite lygį kiekiui nustatyti, tada pridėkite į krepšelį.",
    transBuy: "Pirkite",
    transYouSave: "Sutaupote",
    transAdd: "Pridėti",
    transCartDiscount: "{{ discount }} NUOLAIDA",
    transCartDiscountQty: "(kiekis {{ qty }})",
  },
  lv: {
    transHeading: "Pērciet vairāk, ietaupiet vairāk",
    transQty: "Daudz.",
    transDiscount: "Atlaide",
    transPrice: "Cena / gab.",
    transCountdown: "Akcija beidzas pēc",
    transCta: "Pievienot grozam",
    transFootnote:
      "Izvēlieties līmeni, lai iestatītu daudzumu, pēc tam pievienojiet grozam.",
    transBuy: "Pērciet",
    transYouSave: "Jūs ietaupāt",
    transAdd: "Pievienot",
    transCartDiscount: "{{ discount }} ATLAIDE",
    transCartDiscountQty: "(daudz. {{ qty }})",
  },
  et: {
    transHeading: "Osta rohkem, säästa rohkem",
    transQty: "Kogus",
    transDiscount: "Allahindlus",
    transPrice: "Hind / tk",
    transCountdown: "Allahindlus lõpeb",
    transCta: "Lisa ostukorvi",
    transFootnote:
      "Valige tase koguse määramiseks ja lisage seejärel ostukorvi.",
    transBuy: "Osta",
    transYouSave: "Säästate",
    transAdd: "Lisa",
    transCartDiscount: "{{ discount }} ALLAHINDLUS",
    transCartDiscountQty: "(kogus {{ qty }})",
  },

  // —— Other curated ——
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
  const key = languageKey.trim().toLowerCase();
  return (
    STOREFRONT_TRANSLATION_PRESETS[key] ?? {
      ...ENGLISH_STOREFRONT_TRANSLATION,
    }
  );
}

function fillEmptyTranslationFields(
  languageKey: string,
  existing?: Partial<StorefrontTranslationFields>,
): StorefrontTranslationFields {
  const key = languageKey.trim().toLowerCase();
  const preset = translationPresetForLanguage(key);
  const merged: StorefrontTranslationFields = {
    ...preset,
    ...(existing ?? {}),
  };
  for (const field of Object.keys(preset) as (keyof StorefrontTranslationFields)[]) {
    const value = merged[field];
    const empty = !value || String(value).trim() === "";
    // Non-English sheets still showing English starter copy → use curated EU/etc. preset.
    const stillEnglish =
      key !== "en" &&
      hasCuratedTranslationPreset(key) &&
      value === ENGLISH_STOREFRONT_TRANSLATION[field];
    if (empty || stillEnglish) {
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
