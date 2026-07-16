/**
 * Fill remaining English gaps in admin locale files:
 * - settings.adminLanguage*
 * - pricing.* (locales still on English)
 * - leftover offerEditor.* / common.upgradePlan / settings toasts
 *
 * Usage: node scripts/fix-admin-locale-gaps.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDir = path.join(root, "app", "locales", "admin");

/** settings.adminLanguage* — help uses “below” (settings page), not “managed in Settings”. */
const settingsAdmin = {
  cs: {
    "settings.adminLanguage": "Jazyk administrace",
    "settings.adminLanguageHelp":
      "Jazyk této aplikace v administraci Shopify. Nemění překlady widgetu výlohy níže.",
    "settings.adminLanguageSaved": "Jazyk administrace uložen",
    "settings.adminLanguageSaveError":
      "Jazyk administrace se nepodařilo uložit",
  },
  da: {
    "settings.adminLanguage": "Adminsprog",
    "settings.adminLanguageHelp":
      "Sprog for denne app i Shopify Admin. Ændrer ikke oversættelser for butikswidgeten nedenfor.",
    "settings.adminLanguageSaved": "Adminsprog gemt",
    "settings.adminLanguageSaveError": "Kunne ikke gemme adminsprog",
  },
  es: {
    "settings.adminLanguage": "Idioma del admin",
    "settings.adminLanguageHelp":
      "Idioma de esta app dentro del admin de Shopify. No cambia las traducciones del widget de la tienda abajo.",
    "settings.adminLanguageSaved": "Idioma del admin guardado",
    "settings.adminLanguageSaveError":
      "No se pudo guardar el idioma del admin",
  },
  fi: {
    "settings.adminLanguage": "Hallinnan kieli",
    "settings.adminLanguageHelp":
      "Tämän sovelluksen kieli Shopify Adminissa. Ei muuta alla olevia kaupan widget-käännöksiä.",
    "settings.adminLanguageSaved": "Hallinnan kieli tallennettu",
    "settings.adminLanguageSaveError": "Hallinnan kieltä ei voitu tallentaa",
  },
  fr: {
    "settings.adminLanguage": "Langue de l’admin",
    "settings.adminLanguageHelp":
      "Langue de cette app dans l’admin Shopify. Ne modifie pas les traductions du widget de vitrine ci-dessous.",
    "settings.adminLanguageSaved": "Langue de l’admin enregistrée",
    "settings.adminLanguageSaveError":
      "Impossible d’enregistrer la langue de l’admin",
  },
  it: {
    "settings.adminLanguage": "Lingua admin",
    "settings.adminLanguageHelp":
      "Lingua di questa app nell’admin di Shopify. Non modifica le traduzioni del widget dello storefront qui sotto.",
    "settings.adminLanguageSaved": "Lingua admin salvata",
    "settings.adminLanguageSaveError": "Impossibile salvare la lingua admin",
  },
  ko: {
    "settings.adminLanguage": "관리자 언어",
    "settings.adminLanguageHelp":
      "Shopify 관리자 내 이 앱의 언어입니다. 아래 스토어프론트 위젯 번역은 변경되지 않습니다.",
    "settings.adminLanguageSaved": "관리자 언어가 저장되었습니다",
    "settings.adminLanguageSaveError": "관리자 언어를 저장할 수 없습니다",
  },
  nb: {
    "settings.adminLanguage": "Adminspråk",
    "settings.adminLanguageHelp":
      "Språk for denne appen i Shopify Admin. Endrer ikke oversettelsene for butikkwidgeten nedenfor.",
    "settings.adminLanguageSaved": "Adminspråk lagret",
    "settings.adminLanguageSaveError": "Kunne ikke lagre adminspråk",
  },
  nl: {
    "settings.adminLanguage": "Beheerderstaal",
    "settings.adminLanguageHelp":
      "Taal voor deze app in Shopify Admin. Wijzigt de storefront-widgetvertalingen hieronder niet.",
    "settings.adminLanguageSaved": "Beheerderstaal opgeslagen",
    "settings.adminLanguageSaveError":
      "Beheerderstaal kon niet worden opgeslagen",
  },
  pl: {
    "settings.adminLanguage": "Język panelu",
    "settings.adminLanguageHelp":
      "Język tej aplikacji w panelu Shopify. Nie zmienia tłumaczeń widżetu witryny poniżej.",
    "settings.adminLanguageSaved": "Język panelu zapisany",
    "settings.adminLanguageSaveError": "Nie udało się zapisać języka panelu",
  },
  "pt-BR": {
    "settings.adminLanguage": "Idioma do admin",
    "settings.adminLanguageHelp":
      "Idioma deste app no admin da Shopify. Não altera as traduções do widget da loja abaixo.",
    "settings.adminLanguageSaved": "Idioma do admin salvo",
    "settings.adminLanguageSaveError":
      "Não foi possível salvar o idioma do admin",
  },
  "pt-PT": {
    "settings.adminLanguage": "Idioma do admin",
    "settings.adminLanguageHelp":
      "Idioma desta app no admin da Shopify. Não altera as traduções do widget da loja abaixo.",
    "settings.adminLanguageSaved": "Idioma do admin guardado",
    "settings.adminLanguageSaveError":
      "Não foi possível guardar o idioma do admin",
  },
  pt: {
    "settings.adminLanguage": "Idioma do admin",
    "settings.adminLanguageHelp":
      "Idioma desta app no admin da Shopify. Não altera as traduções do widget da loja abaixo.",
    "settings.adminLanguageSaved": "Idioma do admin guardado",
    "settings.adminLanguageSaveError":
      "Não foi possível guardar o idioma do admin",
  },
  sv: {
    "settings.adminLanguage": "Adminspråk",
    "settings.adminLanguageHelp":
      "Språk för den här appen i Shopify Admin. Ändrar inte översättningarna för butikswidgeten nedan.",
    "settings.adminLanguageSaved": "Adminspråk sparat",
    "settings.adminLanguageSaveError": "Kunde inte spara adminspråk",
  },
  th: {
    "settings.adminLanguage": "ภาษาของผู้ดูแล",
    "settings.adminLanguageHelp":
      "ภาษาสำหรับแอปนี้ใน Shopify Admin ไม่เปลี่ยนการแปลวิดเจ็ตหน้าร้านด้านล่าง",
    "settings.adminLanguageSaved": "บันทึกภาษาของผู้ดูแลแล้ว",
    "settings.adminLanguageSaveError": "ไม่สามารถบันทึกภาษาของผู้ดูแลได้",
  },
  "zh-CN": {
    "settings.adminLanguage": "管理语言",
    "settings.adminLanguageHelp":
      "此应用在 Shopify 管理后台中的语言。不会更改下方的店面小组件翻译。",
    "settings.adminLanguageSaved": "管理语言已保存",
    "settings.adminLanguageSaveError": "无法保存管理语言",
  },
  "zh-TW": {
    "settings.adminLanguage": "管理語言",
    "settings.adminLanguageHelp":
      "此應用程式在 Shopify 管理後台中的語言。不會變更下方的店面小工具翻譯。",
    "settings.adminLanguageSaved": "管理語言已儲存",
    "settings.adminLanguageSaveError": "無法儲存管理語言",
  },
};

/** Full pricing packs for locales still entirely on English. */
const pricingPacks = {
  nl: {
    "pricing.title": "Prijzen",
    "pricing.subtitle": "Kies het abonnement dat bij je winkel past.",
    "pricing.plansHeading": "Abonnementen",
    "pricing.plansIntro":
      "Gratis voor 5 campagnes · Standard voor 25 · Premium onbeperkt. Bespaar {percent}% per jaar. Huidig abonnement: {plan}.",
    "pricing.whatsIncluded": "Wat is inbegrepen",
    "pricing.whatsIncludedSubtitle":
      "Vergelijk functies van Free, Standard en Premium.",
    "pricing.allPlans": "Alle abonnementen",
    "pricing.checkoutTitle": "Afrekenen & winkelwagen",
    "pricing.checkoutBody":
      "Automatische kortingen in winkelwagen en checkout · Geen codes nodig · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "Functie",
    "pricing.compare.activeCampaigns": "Actieve campagnes",
    "pricing.compare.quantityBreaks": "Hoeveelheidskortingen (staffelkaarten)",
    "pricing.compare.volumeDiscount": "Volumekorting (prijstabel)",
    "pricing.compare.appearanceTemplates": "Uiterlijksjablonen",
    "pricing.compare.productPageWidget": "Productpagina-widget",
    "pricing.compare.automaticCheckout": "Automatische checkoutkortingen",
    "pricing.compare.discountTypes": "Kortingstypen (% / bedrag / vast)",
    "pricing.compare.productCollectionTargeting":
      "Product- & collectietargeting",
    "pricing.compare.customerTargeting": "Klanttargeting (tags / login)",
    "pricing.compare.countdownTimers": "Countdowntimers",
    "pricing.compare.offerScheduling": "Aanbiedingsplanning",
    "pricing.compare.campaignAnalytics": "Campagne-analyses",
    "pricing.compare.storefrontTranslations": "Storefront-vertalingen",
    "pricing.compare.schedulingAutomation": "Planning & automatisering",
    "pricing.compare.importExport": "Import & export (CSV / Excel)",
    "pricing.compare.customCss": "Aangepaste CSS & geavanceerde styling",
    "pricing.compare.setupGuide": "Installatiegids & theme-embed",
    "pricing.compare.emailSupport": "E-mailsupport",
    "pricing.value.unlimited": "Onbeperkt",
    "pricing.value.basic": "Basis",
    "pricing.value.advanced": "Geavanceerd",
    "pricing.value.priority": "Prioriteit",
    "pricing.plan.free.description":
      "Hoeveelheidskortingen, volumekorting en sjablonen.",
    "pricing.plan.standard.description":
      "Targeting, planning en campagne-analyses.",
    "pricing.plan.premium.description":
      "Onbeperkte campagnes, import/export en geavanceerde analyses.",
    "pricing.plan.premium.featured": "Meest populair",
    "pricing.feature.campaigns5": "5 actieve campagnes",
    "pricing.feature.campaigns25": "25 actieve campagnes",
    "pricing.feature.campaignsUnlimited": "Onbeperkte campagnes",
    "pricing.feature.quantityBreaks": "Hoeveelheidskortingen (staffelkaarten)",
    "pricing.feature.volumeDiscount": "Volumekorting (prijstabel)",
    "pricing.feature.appearanceTemplates": "Uiterlijksjablonen",
    "pricing.feature.allAppearanceTemplates": "Alle uiterlijksjablonen",
    "pricing.feature.productPageWidget": "Productpagina-widget",
    "pricing.feature.automaticCheckout": "Automatische checkoutkortingen",
    "pricing.feature.basicAnalytics": "Basisanalyses",
    "pricing.feature.campaignAnalytics": "Campagne-analyses",
    "pricing.feature.advancedAnalytics": "Geavanceerde analyses & attributie",
    "pricing.feature.emailSupport": "E-mailsupport",
    "pricing.feature.prioritySupport": "Prioriteitssupport",
    "pricing.feature.targeting": "Product-, collectie- & klanttargeting",
    "pricing.feature.schedulingCountdown":
      "Aanbiedingsplanning & countdowntimers",
    "pricing.feature.storefrontTranslations": "Storefront-vertalingen",
    "pricing.feature.schedulingAutomation": "Planning & automatisering",
    "pricing.feature.importExport": "Import & export (CSV / Excel)",
    "pricing.feature.customCss": "Aangepaste CSS & geavanceerde styling",
    "pricing.selected": "Geselecteerd",
    "pricing.currentPlan": "Huidig abonnement",
    "pricing.payMonthly": "Maandelijks betalen",
    "pricing.payYearly": "Jaarlijks betalen",
    "pricing.saveYearly": "Bespaar {percent}% met jaarlijkse facturering",
    "pricing.frequency.month": "maand",
    "pricing.selectFree": "Free selecteren",
    "pricing.selectStandard": "Standard selecteren",
    "pricing.upgradePremium": "Upgraden naar Premium",
    "pricing.toast.activated": "{plan}-abonnement geactiveerd",
    "pricing.toast.switched": "Overgeschakeld naar {plan}.",
    "pricing.toast.switchedDemote":
      " {kept} actief gehouden (max. abonnement {max}); {drafted} naar concept gezet.",
    "pricing.toast.redirecting":
      "Doorverwijzen naar Shopify om {plan} goed te keuren…",
  },
  pl: {
    "pricing.title": "Cennik",
    "pricing.subtitle": "Wybierz plan dopasowany do Twojego sklepu.",
    "pricing.plansHeading": "Plany",
    "pricing.plansIntro":
      "Free na 5 kampanii · Standard na 25 · Premium bez limitu. Oszczędź {percent}% rocznie. Aktualny plan: {plan}.",
    "pricing.whatsIncluded": "Co jest wliczone",
    "pricing.whatsIncludedSubtitle":
      "Porównaj funkcje planów Free, Standard i Premium.",
    "pricing.allPlans": "Wszystkie plany",
    "pricing.checkoutTitle": "Kasa i koszyk",
    "pricing.checkoutBody":
      "Automatyczne rabaty w koszyku i przy kasie · Bez kodów · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "Funkcja",
    "pricing.compare.activeCampaigns": "Aktywne kampanie",
    "pricing.compare.quantityBreaks": "Rabaty ilościowe (karty progów)",
    "pricing.compare.volumeDiscount": "Rabat wolumenowy (tabela cen)",
    "pricing.compare.appearanceTemplates": "Szablony wyglądu",
    "pricing.compare.productPageWidget": "Widżet strony produktu",
    "pricing.compare.automaticCheckout": "Automatyczne rabaty przy kasie",
    "pricing.compare.discountTypes": "Typy rabatów (% / kwota / stała)",
    "pricing.compare.productCollectionTargeting":
      "Targetowanie produktów i kolekcji",
    "pricing.compare.customerTargeting": "Targetowanie klientów (tagi / logowanie)",
    "pricing.compare.countdownTimers": "Liczniki odliczające",
    "pricing.compare.offerScheduling": "Harmonogram ofert",
    "pricing.compare.campaignAnalytics": "Analityka kampanii",
    "pricing.compare.storefrontTranslations": "Tłumaczenia witryny",
    "pricing.compare.schedulingAutomation": "Harmonogram i automatyzacja",
    "pricing.compare.importExport": "Import i eksport (CSV / Excel)",
    "pricing.compare.customCss": "Własny CSS i zaawansowany styl",
    "pricing.compare.setupGuide": "Przewodnik konfiguracji i osadzenie motywu",
    "pricing.compare.emailSupport": "Wsparcie e-mail",
    "pricing.value.unlimited": "Bez limitu",
    "pricing.value.basic": "Podstawowe",
    "pricing.value.advanced": "Zaawansowane",
    "pricing.value.priority": "Priorytetowe",
    "pricing.plan.free.description":
      "Rabaty ilościowe, rabat wolumenowy i szablony.",
    "pricing.plan.standard.description":
      "Targetowanie, harmonogram i analityka kampanii.",
    "pricing.plan.premium.description":
      "Kampanie bez limitu, import/eksport i zaawansowana analityka.",
    "pricing.plan.premium.featured": "Najpopularniejszy",
    "pricing.feature.campaigns5": "5 aktywnych kampanii",
    "pricing.feature.campaigns25": "25 aktywnych kampanii",
    "pricing.feature.campaignsUnlimited": "Kampanie bez limitu",
    "pricing.feature.quantityBreaks": "Rabaty ilościowe (karty progów)",
    "pricing.feature.volumeDiscount": "Rabat wolumenowy (tabela cen)",
    "pricing.feature.appearanceTemplates": "Szablony wyglądu",
    "pricing.feature.allAppearanceTemplates": "Wszystkie szablony wyglądu",
    "pricing.feature.productPageWidget": "Widżet strony produktu",
    "pricing.feature.automaticCheckout": "Automatyczne rabaty przy kasie",
    "pricing.feature.basicAnalytics": "Podstawowa analityka",
    "pricing.feature.campaignAnalytics": "Analityka kampanii",
    "pricing.feature.advancedAnalytics": "Zaawansowana analityka i atrybucja",
    "pricing.feature.emailSupport": "Wsparcie e-mail",
    "pricing.feature.prioritySupport": "Priorytetowe wsparcie",
    "pricing.feature.targeting":
      "Targetowanie produktów, kolekcji i klientów",
    "pricing.feature.schedulingCountdown":
      "Harmonogram ofert i liczniki odliczające",
    "pricing.feature.storefrontTranslations": "Tłumaczenia witryny",
    "pricing.feature.schedulingAutomation": "Harmonogram i automatyzacja",
    "pricing.feature.importExport": "Import i eksport (CSV / Excel)",
    "pricing.feature.customCss": "Własny CSS i zaawansowany styl",
    "pricing.selected": "Wybrany",
    "pricing.currentPlan": "Aktualny plan",
    "pricing.payMonthly": "Płatność miesięczna",
    "pricing.payYearly": "Płatność roczna",
    "pricing.saveYearly": "Oszczędź {percent}% przy rozliczeniu rocznym",
    "pricing.frequency.month": "miesiąc",
    "pricing.selectFree": "Wybierz Free",
    "pricing.selectStandard": "Wybierz Standard",
    "pricing.upgradePremium": "Ulepsz do Premium",
    "pricing.toast.activated": "Aktywowano plan {plan}",
    "pricing.toast.switched": "Przełączono na {plan}.",
    "pricing.toast.switchedDemote":
      " Pozostawiono {kept} aktywnych (maks. planu {max}); {drafted} przeniesiono do wersji roboczej.",
    "pricing.toast.redirecting":
      "Przekierowanie do Shopify w celu zatwierdzenia {plan}…",
  },
  cs: {
    "pricing.title": "Ceník",
    "pricing.subtitle": "Vyberte plán, který sedí vašemu obchodu.",
    "pricing.plansHeading": "Plány",
    "pricing.plansIntro":
      "Free pro 5 kampaní · Standard pro 25 · Premium neomezeně. Ušetřete {percent}% ročně. Aktuální plán: {plan}.",
    "pricing.whatsIncluded": "Co je zahrnuto",
    "pricing.whatsIncludedSubtitle":
      "Porovnejte funkce Free, Standard a Premium.",
    "pricing.allPlans": "Všechny plány",
    "pricing.checkoutTitle": "Pokladna a košík",
    "pricing.checkoutBody":
      "Automatické slevy v košíku a u pokladny · Bez kódů · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "Funkce",
    "pricing.compare.activeCampaigns": "Aktivní kampaně",
    "pricing.compare.quantityBreaks": "Množstevní slevy (karty stupňů)",
    "pricing.compare.volumeDiscount": "Objemová sleva (cenová tabulka)",
    "pricing.compare.appearanceTemplates": "Šablony vzhledu",
    "pricing.compare.productPageWidget": "Widget produktové stránky",
    "pricing.compare.automaticCheckout": "Automatické slevy u pokladny",
    "pricing.compare.discountTypes": "Typy slev (% / částka / pevná)",
    "pricing.compare.productCollectionTargeting":
      "Cílení na produkty a kolekce",
    "pricing.compare.customerTargeting": "Cílení na zákazníky (tagy / přihlášení)",
    "pricing.compare.countdownTimers": "Odpočítávací časovače",
    "pricing.compare.offerScheduling": "Plánování nabídek",
    "pricing.compare.campaignAnalytics": "Analytika kampaní",
    "pricing.compare.storefrontTranslations": "Překlady výlohy",
    "pricing.compare.schedulingAutomation": "Plánování a automatizace",
    "pricing.compare.importExport": "Import a export (CSV / Excel)",
    "pricing.compare.customCss": "Vlastní CSS a pokročilé styly",
    "pricing.compare.setupGuide": "Průvodce nastavením a vložení tématu",
    "pricing.compare.emailSupport": "E-mailová podpora",
    "pricing.value.unlimited": "Neomezeně",
    "pricing.value.basic": "Základní",
    "pricing.value.advanced": "Pokročilé",
    "pricing.value.priority": "Prioritní",
    "pricing.plan.free.description":
      "Množstevní slevy, objemová sleva a šablony.",
    "pricing.plan.standard.description":
      "Cílení, plánování a analytika kampaní.",
    "pricing.plan.premium.description":
      "Neomezené kampaně, import/export a pokročilá analytika.",
    "pricing.plan.premium.featured": "Nejoblíbenější",
    "pricing.feature.campaigns5": "5 aktivních kampaní",
    "pricing.feature.campaigns25": "25 aktivních kampaní",
    "pricing.feature.campaignsUnlimited": "Neomezené kampaně",
    "pricing.feature.quantityBreaks": "Množstevní slevy (karty stupňů)",
    "pricing.feature.volumeDiscount": "Objemová sleva (cenová tabulka)",
    "pricing.feature.appearanceTemplates": "Šablony vzhledu",
    "pricing.feature.allAppearanceTemplates": "Všechny šablony vzhledu",
    "pricing.feature.productPageWidget": "Widget produktové stránky",
    "pricing.feature.automaticCheckout": "Automatické slevy u pokladny",
    "pricing.feature.basicAnalytics": "Základní analytika",
    "pricing.feature.campaignAnalytics": "Analytika kampaní",
    "pricing.feature.advancedAnalytics": "Pokročilá analytika a atribuce",
    "pricing.feature.emailSupport": "E-mailová podpora",
    "pricing.feature.prioritySupport": "Prioritní podpora",
    "pricing.feature.targeting": "Cílení na produkty, kolekce a zákazníky",
    "pricing.feature.schedulingCountdown":
      "Plánování nabídek a odpočítávací časovače",
    "pricing.feature.storefrontTranslations": "Překlady výlohy",
    "pricing.feature.schedulingAutomation": "Plánování a automatizace",
    "pricing.feature.importExport": "Import a export (CSV / Excel)",
    "pricing.feature.customCss": "Vlastní CSS a pokročilé styly",
    "pricing.selected": "Vybráno",
    "pricing.currentPlan": "Aktuální plán",
    "pricing.payMonthly": "Platit měsíčně",
    "pricing.payYearly": "Platit ročně",
    "pricing.saveYearly": "Ušetřete {percent}% s roční fakturací",
    "pricing.frequency.month": "měsíc",
    "pricing.selectFree": "Vybrat Free",
    "pricing.selectStandard": "Vybrat Standard",
    "pricing.upgradePremium": "Upgradovat na Premium",
    "pricing.toast.activated": "Aktivován plán {plan}",
    "pricing.toast.switched": "Přepnuto na {plan}.",
    "pricing.toast.switchedDemote":
      " Ponecháno {kept} aktivních (max. plánu {max}); {drafted} přesunuto do konceptu.",
    "pricing.toast.redirecting":
      "Přesměrování do Shopify ke schválení {plan}…",
  },
  da: {
    "pricing.title": "Priser",
    "pricing.subtitle": "Vælg den plan, der passer til din butik.",
    "pricing.plansHeading": "Planer",
    "pricing.plansIntro":
      "Gratis til 5 kampagner · Standard til 25 · Premium ubegrænset. Spar {percent}% årligt. Nuværende plan: {plan}.",
    "pricing.whatsIncluded": "Hvad er inkluderet",
    "pricing.whatsIncludedSubtitle":
      "Sammenlign funktioner på Free, Standard og Premium.",
    "pricing.allPlans": "Alle planer",
    "pricing.checkoutTitle": "Checkout & kurv",
    "pricing.checkoutBody":
      "Automatiske rabatter i kurv og checkout · Ingen koder nødvendige · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "Funktion",
    "pricing.compare.activeCampaigns": "Aktive kampagner",
    "pricing.compare.quantityBreaks": "Mængderabatter (trin-kort)",
    "pricing.compare.volumeDiscount": "Volumenrabat (pristabel)",
    "pricing.compare.appearanceTemplates": "Udseendeskabeloner",
    "pricing.compare.productPageWidget": "Produktside-widget",
    "pricing.compare.automaticCheckout": "Automatiske checkout-rabatter",
    "pricing.compare.discountTypes": "Rabattyper (% / beløb / fast)",
    "pricing.compare.productCollectionTargeting":
      "Produkt- og kollektionstargeting",
    "pricing.compare.customerTargeting": "Kundetargeting (tags / login)",
    "pricing.compare.countdownTimers": "Nedtællingstimere",
    "pricing.compare.offerScheduling": "Tilbudsplanlægning",
    "pricing.compare.campaignAnalytics": "Kampagneanalyser",
    "pricing.compare.storefrontTranslations": "Butiksoversættelser",
    "pricing.compare.schedulingAutomation": "Planlægning & automatisering",
    "pricing.compare.importExport": "Import & eksport (CSV / Excel)",
    "pricing.compare.customCss": "Tilpasset CSS & avanceret styling",
    "pricing.compare.setupGuide": "Opsætningsguide & tema-indlejring",
    "pricing.compare.emailSupport": "E-mailsupport",
    "pricing.value.unlimited": "Ubegrænset",
    "pricing.value.basic": "Basis",
    "pricing.value.advanced": "Avanceret",
    "pricing.value.priority": "Prioritet",
    "pricing.plan.free.description":
      "Mængderabatter, volumenrabat og skabeloner.",
    "pricing.plan.standard.description":
      "Targeting, planlægning og kampagneanalyser.",
    "pricing.plan.premium.description":
      "Ubegrænsede kampagner, import/eksport og avancerede analyser.",
    "pricing.plan.premium.featured": "Mest populær",
    "pricing.feature.campaigns5": "5 aktive kampagner",
    "pricing.feature.campaigns25": "25 aktive kampagner",
    "pricing.feature.campaignsUnlimited": "Ubegrænsede kampagner",
    "pricing.feature.quantityBreaks": "Mængderabatter (trin-kort)",
    "pricing.feature.volumeDiscount": "Volumenrabat (pristabel)",
    "pricing.feature.appearanceTemplates": "Udseendeskabeloner",
    "pricing.feature.allAppearanceTemplates": "Alle udseendeskabeloner",
    "pricing.feature.productPageWidget": "Produktside-widget",
    "pricing.feature.automaticCheckout": "Automatiske checkout-rabatter",
    "pricing.feature.basicAnalytics": "Basisanalyser",
    "pricing.feature.campaignAnalytics": "Kampagneanalyser",
    "pricing.feature.advancedAnalytics": "Avancerede analyser & attribution",
    "pricing.feature.emailSupport": "E-mailsupport",
    "pricing.feature.prioritySupport": "Prioritetssupport",
    "pricing.feature.targeting": "Produkt-, kollektion- & kundetargeting",
    "pricing.feature.schedulingCountdown":
      "Tilbudsplanlægning & nedtællingstimere",
    "pricing.feature.storefrontTranslations": "Butiksoversættelser",
    "pricing.feature.schedulingAutomation": "Planlægning & automatisering",
    "pricing.feature.importExport": "Import & eksport (CSV / Excel)",
    "pricing.feature.customCss": "Tilpasset CSS & avanceret styling",
    "pricing.selected": "Valgt",
    "pricing.currentPlan": "Nuværende plan",
    "pricing.payMonthly": "Betal månedligt",
    "pricing.payYearly": "Betal årligt",
    "pricing.saveYearly": "Spar {percent}% med årlig fakturering",
    "pricing.frequency.month": "måned",
    "pricing.selectFree": "Vælg Free",
    "pricing.selectStandard": "Vælg Standard",
    "pricing.upgradePremium": "Opgrader til Premium",
    "pricing.toast.activated": "Aktiverede {plan}-plan",
    "pricing.toast.switched": "Skiftet til {plan}.",
    "pricing.toast.switchedDemote":
      " Beholdt {kept} aktive (planmaks. {max}); flyttede {drafted} til kladde.",
    "pricing.toast.redirecting":
      "Omdirigerer til Shopify for at godkende {plan}…",
  },
  sv: {
    "pricing.title": "Priser",
    "pricing.subtitle": "Välj den plan som passar din butik.",
    "pricing.plansHeading": "Planer",
    "pricing.plansIntro":
      "Gratis för 5 kampanjer · Standard för 25 · Premium obegränsat. Spara {percent}% per år. Nuvarande plan: {plan}.",
    "pricing.whatsIncluded": "Vad som ingår",
    "pricing.whatsIncludedSubtitle":
      "Jämför funktioner i Free, Standard och Premium.",
    "pricing.allPlans": "Alla planer",
    "pricing.checkoutTitle": "Kassa & varukorg",
    "pricing.checkoutBody":
      "Automatiska rabatter i varukorg och kassa · Inga koder behövs · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "Funktion",
    "pricing.compare.activeCampaigns": "Aktiva kampanjer",
    "pricing.compare.quantityBreaks": "Mängdrabatter (nivåkort)",
    "pricing.compare.volumeDiscount": "Volymrabatt (pristabell)",
    "pricing.compare.appearanceTemplates": "Utseendemallar",
    "pricing.compare.productPageWidget": "Produktsidowidget",
    "pricing.compare.automaticCheckout": "Automatiska kassarabatter",
    "pricing.compare.discountTypes": "Rabattyper (% / belopp / fast)",
    "pricing.compare.productCollectionTargeting":
      "Produkt- & kollektionstargeting",
    "pricing.compare.customerTargeting": "Kundtargeting (taggar / inloggning)",
    "pricing.compare.countdownTimers": "Nedräkningstimers",
    "pricing.compare.offerScheduling": "Erbjudandeschemaläggning",
    "pricing.compare.campaignAnalytics": "Kampanjanalyser",
    "pricing.compare.storefrontTranslations": "Butiksöversättningar",
    "pricing.compare.schedulingAutomation": "Schemaläggning & automatisering",
    "pricing.compare.importExport": "Import & export (CSV / Excel)",
    "pricing.compare.customCss": "Anpassad CSS & avancerad styling",
    "pricing.compare.setupGuide": "Installationsguide & tema-inbäddning",
    "pricing.compare.emailSupport": "E-postsupport",
    "pricing.value.unlimited": "Obegränsat",
    "pricing.value.basic": "Grundläggande",
    "pricing.value.advanced": "Avancerat",
    "pricing.value.priority": "Prioritet",
    "pricing.plan.free.description":
      "Mängdrabatter, volymrabatt och mallar.",
    "pricing.plan.standard.description":
      "Targeting, schemaläggning och kampanjanalyser.",
    "pricing.plan.premium.description":
      "Obegränsade kampanjer, import/export och avancerade analyser.",
    "pricing.plan.premium.featured": "Mest populär",
    "pricing.feature.campaigns5": "5 aktiva kampanjer",
    "pricing.feature.campaigns25": "25 aktiva kampanjer",
    "pricing.feature.campaignsUnlimited": "Obegränsade kampanjer",
    "pricing.feature.quantityBreaks": "Mängdrabatter (nivåkort)",
    "pricing.feature.volumeDiscount": "Volymrabatt (pristabell)",
    "pricing.feature.appearanceTemplates": "Utseendemallar",
    "pricing.feature.allAppearanceTemplates": "Alla utseendemallar",
    "pricing.feature.productPageWidget": "Produktsidowidget",
    "pricing.feature.automaticCheckout": "Automatiska kassarabatter",
    "pricing.feature.basicAnalytics": "Grundläggande analyser",
    "pricing.feature.campaignAnalytics": "Kampanjanalyser",
    "pricing.feature.advancedAnalytics": "Avancerade analyser & attribuering",
    "pricing.feature.emailSupport": "E-postsupport",
    "pricing.feature.prioritySupport": "Prioriterad support",
    "pricing.feature.targeting": "Produkt-, kollektion- & kundtargeting",
    "pricing.feature.schedulingCountdown":
      "Erbjudandeschemaläggning & nedräkningstimers",
    "pricing.feature.storefrontTranslations": "Butiksöversättningar",
    "pricing.feature.schedulingAutomation": "Schemaläggning & automatisering",
    "pricing.feature.importExport": "Import & export (CSV / Excel)",
    "pricing.feature.customCss": "Anpassad CSS & avancerad styling",
    "pricing.selected": "Vald",
    "pricing.currentPlan": "Nuvarande plan",
    "pricing.payMonthly": "Betala månadsvis",
    "pricing.payYearly": "Betala årsvis",
    "pricing.saveYearly": "Spara {percent}% med årlig fakturering",
    "pricing.frequency.month": "månad",
    "pricing.selectFree": "Välj Free",
    "pricing.selectStandard": "Välj Standard",
    "pricing.upgradePremium": "Uppgradera till Premium",
    "pricing.toast.activated": "Aktiverade {plan}-planen",
    "pricing.toast.switched": "Bytte till {plan}.",
    "pricing.toast.switchedDemote":
      " Behöll {kept} aktiva (planmax {max}); flyttade {drafted} till utkast.",
    "pricing.toast.redirecting":
      "Omdirigerar till Shopify för att godkänna {plan}…",
  },
  nb: {
    "pricing.title": "Priser",
    "pricing.subtitle": "Velg planen som passer butikken din.",
    "pricing.plansHeading": "Planer",
    "pricing.plansIntro":
      "Gratis for 5 kampanjer · Standard for 25 · Premium ubegrenset. Spar {percent}% årlig. Gjeldende plan: {plan}.",
    "pricing.whatsIncluded": "Hva som er inkludert",
    "pricing.whatsIncludedSubtitle":
      "Sammenlign funksjoner i Free, Standard og Premium.",
    "pricing.allPlans": "Alle planer",
    "pricing.checkoutTitle": "Checkout & handlekurv",
    "pricing.checkoutBody":
      "Automatiske rabatter i handlekurv og checkout · Ingen koder nødvendig · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "Funksjon",
    "pricing.compare.activeCampaigns": "Aktive kampanjer",
    "pricing.compare.quantityBreaks": "Mengderabatter (nivåkort)",
    "pricing.compare.volumeDiscount": "Volumrabatt (pristabell)",
    "pricing.compare.appearanceTemplates": "Utseendemaler",
    "pricing.compare.productPageWidget": "Produktside-widget",
    "pricing.compare.automaticCheckout": "Automatiske checkoutrabatter",
    "pricing.compare.discountTypes": "Rabattyper (% / beløp / fast)",
    "pricing.compare.productCollectionTargeting":
      "Produkt- og kolleksjonstargeting",
    "pricing.compare.customerTargeting": "Kundetargeting (tagger / innlogging)",
    "pricing.compare.countdownTimers": "Nedtellingstimere",
    "pricing.compare.offerScheduling": "Tilbudsplanlegging",
    "pricing.compare.campaignAnalytics": "Kampanjeanalyser",
    "pricing.compare.storefrontTranslations": "Butikkoversettelser",
    "pricing.compare.schedulingAutomation": "Planlegging og automatisering",
    "pricing.compare.importExport": "Import og eksport (CSV / Excel)",
    "pricing.compare.customCss": "Tilpasset CSS og avansert styling",
    "pricing.compare.setupGuide": "Oppsettsveiledning og tema-innbygging",
    "pricing.compare.emailSupport": "E-poststøtte",
    "pricing.value.unlimited": "Ubegrenset",
    "pricing.value.basic": "Grunnleggende",
    "pricing.value.advanced": "Avansert",
    "pricing.value.priority": "Prioritet",
    "pricing.plan.free.description":
      "Mengderabatter, volumrabatt og maler.",
    "pricing.plan.standard.description":
      "Targeting, planlegging og kampanjeanalyser.",
    "pricing.plan.premium.description":
      "Ubegrensede kampanjer, import/eksport og avanserte analyser.",
    "pricing.plan.premium.featured": "Mest populær",
    "pricing.feature.campaigns5": "5 aktive kampanjer",
    "pricing.feature.campaigns25": "25 aktive kampanjer",
    "pricing.feature.campaignsUnlimited": "Ubegrensede kampanjer",
    "pricing.feature.quantityBreaks": "Mengderabatter (nivåkort)",
    "pricing.feature.volumeDiscount": "Volumrabatt (pristabell)",
    "pricing.feature.appearanceTemplates": "Utseendemaler",
    "pricing.feature.allAppearanceTemplates": "Alle utseendemaler",
    "pricing.feature.productPageWidget": "Produktside-widget",
    "pricing.feature.automaticCheckout": "Automatiske checkoutrabatter",
    "pricing.feature.basicAnalytics": "Grunnleggende analyser",
    "pricing.feature.campaignAnalytics": "Kampanjeanalyser",
    "pricing.feature.advancedAnalytics": "Avanserte analyser og attribusjon",
    "pricing.feature.emailSupport": "E-poststøtte",
    "pricing.feature.prioritySupport": "Prioritert støtte",
    "pricing.feature.targeting": "Produkt-, kolleksjon- og kundetargeting",
    "pricing.feature.schedulingCountdown":
      "Tilbudsplanlegging og nedtellingstimere",
    "pricing.feature.storefrontTranslations": "Butikkoversettelser",
    "pricing.feature.schedulingAutomation": "Planlegging og automatisering",
    "pricing.feature.importExport": "Import og eksport (CSV / Excel)",
    "pricing.feature.customCss": "Tilpasset CSS og avansert styling",
    "pricing.selected": "Valgt",
    "pricing.currentPlan": "Gjeldende plan",
    "pricing.payMonthly": "Betal månedlig",
    "pricing.payYearly": "Betal årlig",
    "pricing.saveYearly": "Spar {percent}% med årlig fakturering",
    "pricing.frequency.month": "måned",
    "pricing.selectFree": "Velg Free",
    "pricing.selectStandard": "Velg Standard",
    "pricing.upgradePremium": "Oppgrader til Premium",
    "pricing.toast.activated": "Aktiverte {plan}-planen",
    "pricing.toast.switched": "Byttet til {plan}.",
    "pricing.toast.switchedDemote":
      " Beholdt {kept} aktive (planmaks {max}); flyttet {drafted} til utkast.",
    "pricing.toast.redirecting":
      "Omdirigerer til Shopify for å godkjenne {plan}…",
  },
  fi: {
    "pricing.title": "Hinnoittelu",
    "pricing.subtitle": "Valitse kauppaasi sopiva suunnitelma.",
    "pricing.plansHeading": "Suunnitelmat",
    "pricing.plansIntro":
      "Ilmainen 5 kampanjalle · Standard 25:lle · Premium rajaton. Säästä {percent}% vuodessa. Nykyinen suunnitelma: {plan}.",
    "pricing.whatsIncluded": "Mitä sisältyy",
    "pricing.whatsIncludedSubtitle":
      "Vertaa Free-, Standard- ja Premium-ominaisuuksia.",
    "pricing.allPlans": "Kaikki suunnitelmat",
    "pricing.checkoutTitle": "Kassa ja ostoskori",
    "pricing.checkoutBody":
      "Automaattiset alennukset ostoskorissa ja kassalla · Ei koodeja · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "Ominaisuus",
    "pricing.compare.activeCampaigns": "Aktiiviset kampanjat",
    "pricing.compare.quantityBreaks": "Määräalennukset (tasokortit)",
    "pricing.compare.volumeDiscount": "Volyymialennus (hintataulukko)",
    "pricing.compare.appearanceTemplates": "Ulkoasupohjat",
    "pricing.compare.productPageWidget": "Tuotesivuwidget",
    "pricing.compare.automaticCheckout": "Automaattiset kassa-alennukset",
    "pricing.compare.discountTypes": "Alennustyypit (% / summa / kiinteä)",
    "pricing.compare.productCollectionTargeting":
      "Tuote- ja kokoelmakohdennus",
    "pricing.compare.customerTargeting": "Asiakaskohdennus (tunnisteet / kirjautuminen)",
    "pricing.compare.countdownTimers": "Lähtölaskentajastimet",
    "pricing.compare.offerScheduling": "Tarjousten ajoitus",
    "pricing.compare.campaignAnalytics": "Kampanja-analytiikka",
    "pricing.compare.storefrontTranslations": "Kaupan käännökset",
    "pricing.compare.schedulingAutomation": "Ajoitus ja automaatio",
    "pricing.compare.importExport": "Tuonti ja vienti (CSV / Excel)",
    "pricing.compare.customCss": "Mukautettu CSS ja edistynyt tyylittely",
    "pricing.compare.setupGuide": "Asennusopas ja teeman upotus",
    "pricing.compare.emailSupport": "Sähköpostituki",
    "pricing.value.unlimited": "Rajaton",
    "pricing.value.basic": "Perus",
    "pricing.value.advanced": "Edistynyt",
    "pricing.value.priority": "Prioriteetti",
    "pricing.plan.free.description":
      "Määräalennukset, volyymialennus ja pohjat.",
    "pricing.plan.standard.description":
      "Kohdennus, ajoitus ja kampanja-analytiikka.",
    "pricing.plan.premium.description":
      "Rajoittamattomat kampanjat, tuonti/vienti ja edistynyt analytiikka.",
    "pricing.plan.premium.featured": "Suosituin",
    "pricing.feature.campaigns5": "5 aktiivista kampanjaa",
    "pricing.feature.campaigns25": "25 aktiivista kampanjaa",
    "pricing.feature.campaignsUnlimited": "Rajoittamattomat kampanjat",
    "pricing.feature.quantityBreaks": "Määräalennukset (tasokortit)",
    "pricing.feature.volumeDiscount": "Volyymialennus (hintataulukko)",
    "pricing.feature.appearanceTemplates": "Ulkoasupohjat",
    "pricing.feature.allAppearanceTemplates": "Kaikki ulkoasupohjat",
    "pricing.feature.productPageWidget": "Tuotesivuwidget",
    "pricing.feature.automaticCheckout": "Automaattiset kassa-alennukset",
    "pricing.feature.basicAnalytics": "Perusanalytiikka",
    "pricing.feature.campaignAnalytics": "Kampanja-analytiikka",
    "pricing.feature.advancedAnalytics": "Edistynyt analytiikka ja attribuutio",
    "pricing.feature.emailSupport": "Sähköpostituki",
    "pricing.feature.prioritySupport": "Prioriteettituki",
    "pricing.feature.targeting": "Tuote-, kokoelma- ja asiakaskohdennus",
    "pricing.feature.schedulingCountdown":
      "Tarjousten ajoitus ja lähtölaskentajastimet",
    "pricing.feature.storefrontTranslations": "Kaupan käännökset",
    "pricing.feature.schedulingAutomation": "Ajoitus ja automaatio",
    "pricing.feature.importExport": "Tuonti ja vienti (CSV / Excel)",
    "pricing.feature.customCss": "Mukautettu CSS ja edistynyt tyylittely",
    "pricing.selected": "Valittu",
    "pricing.currentPlan": "Nykyinen suunnitelma",
    "pricing.payMonthly": "Maksa kuukausittain",
    "pricing.payYearly": "Maksa vuosittain",
    "pricing.saveYearly": "Säästä {percent}% vuosilaskutuksella",
    "pricing.frequency.month": "kuukausi",
    "pricing.selectFree": "Valitse Free",
    "pricing.selectStandard": "Valitse Standard",
    "pricing.upgradePremium": "Päivitä Premiumiin",
    "pricing.toast.activated": "{plan}-suunnitelma aktivoitu",
    "pricing.toast.switched": "Vaihdettu suunnitelmaan {plan}.",
    "pricing.toast.switchedDemote":
      " Pidettiin {kept} aktiivisina (suunnitelman max {max}); siirrettiin {drafted} luonnokseksi.",
    "pricing.toast.redirecting":
      "Ohjataan Shopifyyn hyväksymään {plan}…",
  },
  "pt-PT": {
    "pricing.title": "Preços",
    "pricing.subtitle": "Escolha o plano adequado à sua loja.",
    "pricing.plansHeading": "Planos",
    "pricing.plansIntro":
      "Grátis para 5 campanhas · Standard para 25 · Premium ilimitado. Poupe {percent}% ao ano. Plano atual: {plan}.",
    "pricing.whatsIncluded": "O que está incluído",
    "pricing.whatsIncludedSubtitle":
      "Compare funcionalidades Free, Standard e Premium.",
    "pricing.allPlans": "Todos os planos",
    "pricing.checkoutTitle": "Checkout e carrinho",
    "pricing.checkoutBody":
      "Descontos automáticos no carrinho e no checkout · Sem códigos · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "Funcionalidade",
    "pricing.compare.activeCampaigns": "Campanhas ativas",
    "pricing.compare.quantityBreaks": "Descontos por quantidade (cartões de níveis)",
    "pricing.compare.volumeDiscount": "Desconto de volume (tabela de preços)",
    "pricing.compare.appearanceTemplates": "Modelos de aparência",
    "pricing.compare.productPageWidget": "Widget da página do produto",
    "pricing.compare.automaticCheckout": "Descontos automáticos no checkout",
    "pricing.compare.discountTypes": "Tipos de desconto (% / valor / fixo)",
    "pricing.compare.productCollectionTargeting":
      "Segmentação de produtos e coleções",
    "pricing.compare.customerTargeting": "Segmentação de clientes (etiquetas / login)",
    "pricing.compare.countdownTimers": "Temporizadores de contagem decrescente",
    "pricing.compare.offerScheduling": "Agendamento de ofertas",
    "pricing.compare.campaignAnalytics": "Análises de campanhas",
    "pricing.compare.storefrontTranslations": "Traduções da loja",
    "pricing.compare.schedulingAutomation": "Agendamento e automatização",
    "pricing.compare.importExport": "Importação e exportação (CSV / Excel)",
    "pricing.compare.customCss": "CSS personalizado e estilo avançado",
    "pricing.compare.setupGuide": "Guia de configuração e incorporação do tema",
    "pricing.compare.emailSupport": "Suporte por e-mail",
    "pricing.value.unlimited": "Ilimitado",
    "pricing.value.basic": "Básico",
    "pricing.value.advanced": "Avançado",
    "pricing.value.priority": "Prioritário",
    "pricing.plan.free.description":
      "Descontos por quantidade, desconto de volume e modelos.",
    "pricing.plan.standard.description":
      "Segmentação, agendamento e análises de campanhas.",
    "pricing.plan.premium.description":
      "Campanhas ilimitadas, importação/exportação e análises avançadas.",
    "pricing.plan.premium.featured": "Mais popular",
    "pricing.feature.campaigns5": "5 campanhas ativas",
    "pricing.feature.campaigns25": "25 campanhas ativas",
    "pricing.feature.campaignsUnlimited": "Campanhas ilimitadas",
    "pricing.feature.quantityBreaks": "Descontos por quantidade (cartões de níveis)",
    "pricing.feature.volumeDiscount": "Desconto de volume (tabela de preços)",
    "pricing.feature.appearanceTemplates": "Modelos de aparência",
    "pricing.feature.allAppearanceTemplates": "Todos os modelos de aparência",
    "pricing.feature.productPageWidget": "Widget da página do produto",
    "pricing.feature.automaticCheckout": "Descontos automáticos no checkout",
    "pricing.feature.basicAnalytics": "Análises básicas",
    "pricing.feature.campaignAnalytics": "Análises de campanhas",
    "pricing.feature.advancedAnalytics": "Análises avançadas e atribuição",
    "pricing.feature.emailSupport": "Suporte por e-mail",
    "pricing.feature.prioritySupport": "Suporte prioritário",
    "pricing.feature.targeting":
      "Segmentação de produtos, coleções e clientes",
    "pricing.feature.schedulingCountdown":
      "Agendamento de ofertas e temporizadores",
    "pricing.feature.storefrontTranslations": "Traduções da loja",
    "pricing.feature.schedulingAutomation": "Agendamento e automatização",
    "pricing.feature.importExport": "Importação e exportação (CSV / Excel)",
    "pricing.feature.customCss": "CSS personalizado e estilo avançado",
    "pricing.selected": "Selecionado",
    "pricing.currentPlan": "Plano atual",
    "pricing.payMonthly": "Pagar mensalmente",
    "pricing.payYearly": "Pagar anualmente",
    "pricing.saveYearly": "Poupe {percent}% com faturação anual",
    "pricing.frequency.month": "mês",
    "pricing.selectFree": "Selecionar Free",
    "pricing.selectStandard": "Selecionar Standard",
    "pricing.upgradePremium": "Atualizar para Premium",
    "pricing.toast.activated": "Plano {plan} ativado",
    "pricing.toast.switched": "Mudou para {plan}.",
    "pricing.toast.switchedDemote":
      " Manteve {kept} ativas (máx. do plano {max}); moveu {drafted} para rascunho.",
    "pricing.toast.redirecting":
      "A redirecionar para a Shopify para aprovar {plan}…",
  },
  th: {
    "pricing.title": "ราคา",
    "pricing.subtitle": "เลือกแผนที่เหมาะกับร้านของคุณ",
    "pricing.plansHeading": "แผน",
    "pricing.plansIntro":
      "ฟรีสำหรับ 5 แคมเปญ · Standard สำหรับ 25 · Premium ไม่จำกัด ประหยัด {percent}% ต่อปี แผนปัจจุบัน: {plan}",
    "pricing.whatsIncluded": "สิ่งที่รวมอยู่",
    "pricing.whatsIncludedSubtitle":
      "เปรียบเทียบฟีเจอร์ของ Free, Standard และ Premium",
    "pricing.allPlans": "แผนทั้งหมด",
    "pricing.checkoutTitle": "เช็คเอาต์และตะกร้า",
    "pricing.checkoutBody":
      "ส่วนลดอัตโนมัติในตะกร้าและเช็คเอาต์ · ไม่ต้องใช้โค้ด · Powered by Shopify Discount Functions",
    "pricing.compare.feature": "ฟีเจอร์",
    "pricing.compare.activeCampaigns": "แคมเปญที่ใช้งานอยู่",
    "pricing.compare.quantityBreaks": "ส่วนลดตามปริมาณ (การ์ดระดับ)",
    "pricing.compare.volumeDiscount": "ส่วนลดตามปริมาณ (ตารางราคา)",
    "pricing.compare.appearanceTemplates": "เทมเพลตลักษณะ",
    "pricing.compare.productPageWidget": "วิดเจ็ตหน้าสินค้า",
    "pricing.compare.automaticCheckout": "ส่วนลดเช็คเอาต์อัตโนมัติ",
    "pricing.compare.discountTypes": "ประเภทส่วนลด (% / จำนวนเงิน / ราคาคงที่)",
    "pricing.compare.productCollectionTargeting":
      "การกำหนดเป้าหมายสินค้าและคอลเลกชัน",
    "pricing.compare.customerTargeting": "การกำหนดเป้าหมายลูกค้า (แท็ก / เข้าสู่ระบบ)",
    "pricing.compare.countdownTimers": "ตัวนับถอยหลัง",
    "pricing.compare.offerScheduling": "การจัดตารางข้อเสนอ",
    "pricing.compare.campaignAnalytics": "การวิเคราะห์แคมเปญ",
    "pricing.compare.storefrontTranslations": "การแปลหน้าร้าน",
    "pricing.compare.schedulingAutomation": "การจัดตารางและระบบอัตโนมัติ",
    "pricing.compare.importExport": "นำเข้าและส่งออก (CSV / Excel)",
    "pricing.compare.customCss": "CSS แบบกำหนดเองและการจัดสไตล์ขั้นสูง",
    "pricing.compare.setupGuide": "คู่มือการตั้งค่าและการฝังธีม",
    "pricing.compare.emailSupport": "การสนับสนุนทางอีเมล",
    "pricing.value.unlimited": "ไม่จำกัด",
    "pricing.value.basic": "พื้นฐาน",
    "pricing.value.advanced": "ขั้นสูง",
    "pricing.value.priority": "ลำดับความสำคัญ",
    "pricing.plan.free.description":
      "ส่วนลดตามปริมาณ ส่วนลดวอลุ่ม และเทมเพลต",
    "pricing.plan.standard.description":
      "การกำหนดเป้าหมาย การจัดตาราง และการวิเคราะห์แคมเปญ",
    "pricing.plan.premium.description":
      "แคมเปญไม่จำกัด นำเข้า/ส่งออก และการวิเคราะห์ขั้นสูง",
    "pricing.plan.premium.featured": "ยอดนิยมที่สุด",
    "pricing.feature.campaigns5": "5 แคมเปญที่ใช้งานอยู่",
    "pricing.feature.campaigns25": "25 แคมเปญที่ใช้งานอยู่",
    "pricing.feature.campaignsUnlimited": "แคมเปญไม่จำกัด",
    "pricing.feature.quantityBreaks": "ส่วนลดตามปริมาณ (การ์ดระดับ)",
    "pricing.feature.volumeDiscount": "ส่วนลดตามปริมาณ (ตารางราคา)",
    "pricing.feature.appearanceTemplates": "เทมเพลตลักษณะ",
    "pricing.feature.allAppearanceTemplates": "เทมเพลตลักษณะทั้งหมด",
    "pricing.feature.productPageWidget": "วิดเจ็ตหน้าสินค้า",
    "pricing.feature.automaticCheckout": "ส่วนลดเช็คเอาต์อัตโนมัติ",
    "pricing.feature.basicAnalytics": "การวิเคราะห์พื้นฐาน",
    "pricing.feature.campaignAnalytics": "การวิเคราะห์แคมเปญ",
    "pricing.feature.advancedAnalytics": "การวิเคราะห์ขั้นสูงและการระบุแหล่งที่มา",
    "pricing.feature.emailSupport": "การสนับสนุนทางอีเมล",
    "pricing.feature.prioritySupport": "การสนับสนุนลำดับความสำคัญ",
    "pricing.feature.targeting":
      "การกำหนดเป้าหมายสินค้า คอลเลกชัน และลูกค้า",
    "pricing.feature.schedulingCountdown":
      "การจัดตารางข้อเสนอและตัวนับถอยหลัง",
    "pricing.feature.storefrontTranslations": "การแปลหน้าร้าน",
    "pricing.feature.schedulingAutomation": "การจัดตารางและระบบอัตโนมัติ",
    "pricing.feature.importExport": "นำเข้าและส่งออก (CSV / Excel)",
    "pricing.feature.customCss": "CSS แบบกำหนดเองและการจัดสไตล์ขั้นสูง",
    "pricing.selected": "เลือกแล้ว",
    "pricing.currentPlan": "แผนปัจจุบัน",
    "pricing.payMonthly": "ชำระรายเดือน",
    "pricing.payYearly": "ชำระรายปี",
    "pricing.saveYearly": "ประหยัด {percent}% ด้วยการเรียกเก็บรายปี",
    "pricing.frequency.month": "เดือน",
    "pricing.selectFree": "เลือก Free",
    "pricing.selectStandard": "เลือก Standard",
    "pricing.upgradePremium": "อัปเกรดเป็น Premium",
    "pricing.toast.activated": "เปิดใช้แผน {plan} แล้ว",
    "pricing.toast.switched": "เปลี่ยนเป็น {plan} แล้ว",
    "pricing.toast.switchedDemote":
      " คง {kept} รายการที่ใช้งานอยู่ (สูงสุดของแผน {max}); ย้าย {drafted} เป็นแบบร่าง",
    "pricing.toast.redirecting":
      "กำลังเปลี่ยนเส้นทางไปยัง Shopify เพื่ออนุมัติ {plan}…",
  },
};

// pt-BR from pt-PT with BR wording tweaks
pricingPacks["pt-BR"] = {
  ...pricingPacks["pt-PT"],
  "pricing.subtitle": "Escolha o plano ideal para a sua loja.",
  "pricing.plansIntro":
    "Grátis para 5 campanhas · Standard para 25 · Premium ilimitado. Economize {percent}% ao ano. Plano atual: {plan}.",
  "pricing.saveYearly": "Economize {percent}% com cobrança anual",
  "pricing.toast.activated": "Plano {plan} ativado",
  "pricing.toast.switched": "Mudou para {plan}.",
  "pricing.toast.redirecting":
    "Redirecionando para a Shopify para aprovar {plan}…",
  "pricing.toast.switchedDemote":
    " Manteve {kept} ativas (máx. do plano {max}); moveu {drafted} para rascunho.",
};
pricingPacks.pt = { ...pricingPacks["pt-PT"] };

/** Shared offer-editor leftovers that are still English in many locales. */
const offerEditorPacks = {
  de: {
    "offerEditor.backA11y": "Zurück zu den Angebotstypen",
    "offerEditor.campaignNameHelp":
      "Interner Name für dieses Angebot in der App. Kundenseitiger Text wird unter Anzeigeeinstellungen festgelegt.",
    "offerEditor.discountedProductsHelp":
      "Wählen Sie, worauf dieser Rabatt gilt. Mit Durchsuchen Ressourcen aus Ihrem Shop auswählen.",
    "offerEditor.productScope": "Produktumfang",
    "offerEditor.quantityConditions": "Mengenbedingungen festlegen",
    "offerEditor.quantityConditionsHelp":
      "Legen Sie fest, wie Kaufmengen-Stufen gezählt werden — Warenkorb gesamt, pro Produkt, pro Variante oder pro Kollektion.",
    "offerEditor.quantityBasis": "Mengenbasis",
    "offerEditor.targetCustomerHelp":
      "Wählen Sie, welche Kunden diesen Rabatt nutzen können.",
    "offerEditor.customerType": "Kundentyp",
    "offerEditor.displayName": "Anzeigename",
    "offerEditor.textButton": "Textschaltfläche",
    "offerEditor.buttonAction": "Schaltflächenaktion",
    "offerEditor.pageUrl": "Seiten-URL",
    "offerEditor.widgetText": "Widget-Text (Storefront)",
    "offerEditor.widgetTextHelp":
      "Text der Produktseite. Schriften und Farben: Tab Erscheinungsbild.",
    "offerEditor.widgetAppearance": "Widget-Erscheinungsbild (Storefront)",
    "offerEditor.desktopPreview": "Desktop-Vorschau",
    "offerEditor.mobilePreview": "Mobile Vorschau",
  },
  fr: {
    "offerEditor.backA11y": "Retour aux types d’offre",
    "offerEditor.campaignNameHelp":
      "Nom interne de cette offre dans l’app. Le texte visible par le client se règle sous Affichage.",
    "offerEditor.discountedProductsHelp":
      "Choisissez à quoi s’applique cette remise. Utilisez Parcourir pour sélectionner des ressources de votre boutique.",
    "offerEditor.productScope": "Périmètre produits",
    "offerEditor.quantityConditions": "Définir les conditions de quantité",
    "offerEditor.quantityConditionsHelp":
      "Choisissez comment les paliers d’achat sont comptés — total du panier, par produit, par variante ou par collection.",
    "offerEditor.quantityBasis": "Base de quantité",
    "offerEditor.targetCustomerHelp":
      "Choisissez quels clients peuvent utiliser cette remise.",
    "offerEditor.customerType": "Type de client",
    "offerEditor.displayName": "Nom d’affichage",
    "offerEditor.textButton": "Bouton texte",
    "offerEditor.buttonAction": "Action du bouton",
    "offerEditor.pageUrl": "URL de la page",
    "offerEditor.widgetText": "Texte du widget (vitrine)",
    "offerEditor.widgetTextHelp":
      "Texte de la page produit. Polices et couleurs : onglet Apparence.",
    "offerEditor.widgetAppearance": "Apparence du widget (vitrine)",
    "offerEditor.desktopPreview": "Aperçu bureau",
    "offerEditor.mobilePreview": "Aperçu mobile",
    "settings.adminLanguage": "Langue de l’admin",
    "settings.adminLanguageHelp":
      "Langue de cette app dans l’admin Shopify. Ne modifie pas les traductions du widget de vitrine ci-dessous.",
    "settings.adminLanguageSaved": "Langue de l’admin enregistrée",
    "settings.adminLanguageSaveError":
      "Impossible d’enregistrer la langue de l’admin",
  },
  es: {
    "offerEditor.backA11y": "Volver a tipos de oferta",
    "offerEditor.campaignNameHelp":
      "Nombre interno de esta oferta en la app. El texto visible para el cliente se configura en Ajustes de visualización.",
    "offerEditor.discountedProductsHelp":
      "Elige a qué se aplica este descuento. Usa Explorar para elegir recursos de tu tienda.",
    "offerEditor.productScope": "Alcance de productos",
    "offerEditor.quantityConditions": "Definir condiciones de cantidad",
    "offerEditor.quantityConditionsHelp":
      "Elige cómo se cuentan los niveles de compra: total del carrito, por producto, por variante o por colección.",
    "offerEditor.quantityBasis": "Base de cantidad",
    "offerEditor.targetCustomerHelp":
      "Elige qué clientes pueden usar este descuento.",
    "offerEditor.customerType": "Tipo de cliente",
    "offerEditor.displayName": "Nombre para mostrar",
    "offerEditor.textButton": "Botón de texto",
    "offerEditor.buttonAction": "Acción del botón",
    "offerEditor.pageUrl": "URL de la página",
    "offerEditor.widgetText": "Texto del widget (tienda)",
    "offerEditor.widgetTextHelp":
      "Texto de la página de producto. Fuentes y colores: pestaña Apariencia.",
    "offerEditor.widgetAppearance": "Apariencia del widget (tienda)",
    "offerEditor.desktopPreview": "Vista previa de escritorio",
    "offerEditor.mobilePreview": "Vista previa móvil",
  },
  it: {
    "offerEditor.backA11y": "Torna ai tipi di offerta",
    "offerEditor.campaignNameHelp":
      "Nome interno di questa offerta nell’app. Il testo rivolto al cliente si imposta in Impostazioni di visualizzazione.",
    "offerEditor.discountedProductsHelp":
      "Scegli a cosa si applica questo sconto. Usa Sfoglia per selezionare risorse del negozio.",
    "offerEditor.productScope": "Ambito prodotti",
    "offerEditor.quantityConditions": "Imposta condizioni di quantità",
    "offerEditor.quantityConditionsHelp":
      "Scegli come conteggiare i livelli di acquisto — totale carrello, per prodotto, per variante o per collezione.",
    "offerEditor.quantityBasis": "Base quantità",
    "offerEditor.targetCustomerHelp":
      "Scegli quali clienti possono usare questo sconto.",
    "offerEditor.customerType": "Tipo di cliente",
    "offerEditor.displayName": "Nome visualizzato",
    "offerEditor.textButton": "Pulsante testo",
    "offerEditor.buttonAction": "Azione del pulsante",
    "offerEditor.pageUrl": "URL della pagina",
    "offerEditor.widgetText": "Testo del widget (storefront)",
    "offerEditor.widgetTextHelp":
      "Testo della pagina prodotto. Font e colori: scheda Aspetto.",
    "offerEditor.widgetAppearance": "Aspetto del widget (storefront)",
    "offerEditor.desktopPreview": "Anteprima desktop",
    "offerEditor.mobilePreview": "Anteprima mobile",
  },
  tr: {
    "offerEditor.backA11y": "Teklif türlerine geri dön",
    "offerEditor.campaignNameHelp":
      "Bu teklifin uygulamadaki dahili adı. Müşteriye görünen metin Görüntüleme ayarlarında belirlenir.",
    "offerEditor.discountedProductsHelp":
      "Bu indirimin neye uygulanacağını seçin. Mağazanızdan kaynak seçmek için Gözat’ı kullanın.",
    "offerEditor.productScope": "Ürün kapsamı",
    "offerEditor.quantityConditions": "Miktar koşullarını ayarla",
    "offerEditor.quantityConditionsHelp":
      "Satın alma miktar kademelerinin nasıl sayılacağını seçin — sepet toplamı, ürün başına, varyant başına veya koleksiyon başına.",
    "offerEditor.quantityBasis": "Miktar temeli",
    "offerEditor.targetCustomerHelp":
      "Bu indirimi hangi müşterilerin kullanabileceğini seçin.",
    "offerEditor.customerType": "Müşteri türü",
    "offerEditor.displayName": "Görünen ad",
    "offerEditor.textButton": "Metin düğmesi",
    "offerEditor.buttonAction": "Düğme eylemi",
    "offerEditor.pageUrl": "Sayfa URL’si",
    "offerEditor.widgetText": "Widget metni (vitrin)",
    "offerEditor.widgetTextHelp":
      "Ürün sayfası metni. Yazı tipleri ve renkler: Görünüm sekmesi.",
    "offerEditor.widgetAppearance": "Widget görünümü (vitrin)",
    "offerEditor.desktopPreview": "Masaüstü önizleme",
    "offerEditor.mobilePreview": "Mobil önizleme",
  },
  ja: {
    "offerEditor.backA11y": "オファータイプに戻る",
    "offerEditor.campaignNameHelp":
      "アプリ内でのこのオファーの内部名です。お客様向けの文言は表示設定で設定します。",
    "offerEditor.discountedProductsHelp":
      "この割引の対象を選択します。参照を使ってストアのリソースを選びます。",
    "offerEditor.productScope": "商品範囲",
    "offerEditor.quantityConditions": "数量条件を設定",
    "offerEditor.quantityConditionsHelp":
      "購入数量ティアの数え方を選択 — カート合計、商品ごと、バリアントごと、コレクションごと。",
    "offerEditor.quantityBasis": "数量の基準",
    "offerEditor.targetCustomerHelp":
      "この割引を利用できるお客様を選択します。",
    "offerEditor.customerType": "顧客タイプ",
    "offerEditor.displayName": "表示名",
    "offerEditor.textButton": "テキストボタン",
    "offerEditor.buttonAction": "ボタンのアクション",
    "offerEditor.pageUrl": "ページURL",
    "offerEditor.widgetText": "ウィジェットテキスト（ストアフロント）",
    "offerEditor.widgetTextHelp":
      "商品ページの文言。フォントと色：外観タブ。",
    "offerEditor.widgetAppearance": "ウィジェットの外観（ストアフロント）",
    "offerEditor.desktopPreview": "デスクトッププレビュー",
    "offerEditor.mobilePreview": "モバイルプレビュー",
  },
  ko: {
    "offerEditor.backA11y": "오퍼 유형으로 돌아가기",
    "offerEditor.campaignNameHelp":
      "앱 내 이 오퍼의 내부 이름입니다. 고객에게 보이는 텍스트는 표시 설정에서 지정합니다.",
    "offerEditor.discountedProductsHelp":
      "이 할인이 적용될 대상을 선택하세요. 찾아보기로 스토어 리소스를 고르세요.",
    "offerEditor.productScope": "제품 범위",
    "offerEditor.quantityConditions": "수량 조건 설정",
    "offerEditor.quantityConditionsHelp":
      "구매 수량 티어 집계 방식을 선택 — 장바구니 합계, 제품별, 변형별 또는 컬렉션별.",
    "offerEditor.quantityBasis": "수량 기준",
    "offerEditor.targetCustomerHelp":
      "이 할인을 사용할 수 있는 고객을 선택하세요.",
    "offerEditor.customerType": "고객 유형",
    "offerEditor.displayName": "표시 이름",
    "offerEditor.textButton": "텍스트 버튼",
    "offerEditor.buttonAction": "버튼 동작",
    "offerEditor.pageUrl": "페이지 URL",
    "offerEditor.widgetText": "위젯 텍스트(스토어프론트)",
    "offerEditor.widgetTextHelp":
      "제품 페이지 문구. 글꼴과 색상: 모양 탭.",
    "offerEditor.widgetAppearance": "위젯 모양(스토어프론트)",
    "offerEditor.desktopPreview": "데스크톱 미리보기",
    "offerEditor.mobilePreview": "모바일 미리보기",
  },
  vi: {
    "offerEditor.backA11y": "Quay lại loại ưu đãi",
    "offerEditor.campaignNameHelp":
      "Tên nội bộ của ưu đãi này trong ứng dụng. Văn bản dành cho khách được đặt trong Cài đặt hiển thị.",
    "offerEditor.discountedProductsHelp":
      "Chọn đối tượng áp dụng giảm giá này. Dùng Duyệt để chọn tài nguyên từ cửa hàng.",
    "offerEditor.productScope": "Phạm vi sản phẩm",
    "offerEditor.quantityConditions": "Đặt điều kiện số lượng",
    "offerEditor.quantityConditionsHelp":
      "Chọn cách đếm bậc số lượng mua — tổng giỏ hàng, theo sản phẩm, theo biến thể hoặc theo bộ sưu tập.",
    "offerEditor.quantityBasis": "Cơ sở số lượng",
    "offerEditor.targetCustomerHelp":
      "Chọn khách hàng nào có thể dùng giảm giá này.",
    "offerEditor.customerType": "Loại khách hàng",
    "offerEditor.displayName": "Tên hiển thị",
    "offerEditor.textButton": "Nút văn bản",
    "offerEditor.buttonAction": "Hành động nút",
    "offerEditor.pageUrl": "URL trang",
    "offerEditor.widgetText": "Văn bản widget (storefront)",
    "offerEditor.widgetTextHelp":
      "Nội dung trang sản phẩm. Phông chữ và màu: tab Giao diện.",
    "offerEditor.widgetAppearance": "Giao diện widget (storefront)",
    "offerEditor.desktopPreview": "Xem trước máy tính",
    "offerEditor.mobilePreview": "Xem trước di động",
  },
  "zh-CN": {
    "offerEditor.backA11y": "返回优惠类型",
    "offerEditor.campaignNameHelp":
      "此优惠在应用中的内部名称。面向顾客的文案在显示设置中配置。",
    "offerEditor.discountedProductsHelp":
      "选择此折扣适用的对象。使用浏览从商店中选取资源。",
    "offerEditor.productScope": "产品范围",
    "offerEditor.quantityConditions": "设置数量条件",
    "offerEditor.quantityConditionsHelp":
      "选择购买数量档位的计数方式 — 购物车合计、按产品、按变体或按系列。",
    "offerEditor.quantityBasis": "数量基准",
    "offerEditor.targetCustomerHelp": "选择哪些顾客可以使用此折扣。",
    "offerEditor.customerType": "顾客类型",
    "offerEditor.displayName": "显示名称",
    "offerEditor.textButton": "文本按钮",
    "offerEditor.buttonAction": "按钮操作",
    "offerEditor.pageUrl": "页面网址",
    "offerEditor.widgetText": "小组件文本（店面）",
    "offerEditor.widgetTextHelp": "产品页文案。字体与颜色：外观选项卡。",
    "offerEditor.widgetAppearance": "小组件外观（店面）",
    "offerEditor.desktopPreview": "桌面预览",
    "offerEditor.mobilePreview": "移动预览",
  },
  "zh-TW": {
    "offerEditor.backA11y": "返回優惠類型",
    "offerEditor.campaignNameHelp":
      "此優惠在應用程式中的內部名稱。面向顧客的文案在顯示設定中設定。",
    "offerEditor.discountedProductsHelp":
      "選擇此折扣適用的對象。使用瀏覽從商店中選取資源。",
    "offerEditor.productScope": "產品範圍",
    "offerEditor.quantityConditions": "設定數量條件",
    "offerEditor.quantityConditionsHelp":
      "選擇購買數量級距的計算方式 — 購物車合計、依產品、依款式或依系列。",
    "offerEditor.quantityBasis": "數量基準",
    "offerEditor.targetCustomerHelp": "選擇哪些顧客可以使用此折扣。",
    "offerEditor.customerType": "顧客類型",
    "offerEditor.displayName": "顯示名稱",
    "offerEditor.textButton": "文字按鈕",
    "offerEditor.buttonAction": "按鈕動作",
    "offerEditor.pageUrl": "頁面網址",
    "offerEditor.widgetText": "小工具文字（店面）",
    "offerEditor.widgetTextHelp": "產品頁文案。字型與顏色：外觀分頁。",
    "offerEditor.widgetAppearance": "小工具外觀（店面）",
    "offerEditor.desktopPreview": "桌面預覽",
    "offerEditor.mobilePreview": "行動預覽",
  },
  nl: {
    "offerEditor.createTitle": "{type} maken",
    "offerEditor.editTitle": "{type} bewerken",
    "offerEditor.quantityBreaks": "Hoeveelheidskortingen",
    "offerEditor.volumeDiscount": "Volumekorting",
    "offerEditor.offerTypes": "Aanbiedingstypen",
    "offerEditor.backA11y": "Terug naar aanbiedingstypen",
    "offerEditor.discard": "Verwerpen",
    "offerEditor.save": "Opslaan",
    "offerEditor.couldNotSave": "Opslaan mislukt",
    "offerEditor.undo": "Ongedaan maken",
    "offerEditor.redo": "Opnieuw",
    "offerEditor.tab.rules": "Regelinstellingen",
    "offerEditor.tab.display": "Weergave-instellingen",
    "offerEditor.tab.appearance": "Uiterlijk",
    "offerEditor.campaignDetails": "Campagnedetails",
    "offerEditor.campaignName": "Campagnenaam",
    "offerEditor.campaignNameHelp":
      "Interne naam voor deze aanbieding in de app. Klantgerichte tekst stel je in onder Weergave-instellingen.",
    "offerEditor.discountRules": "Kortingsregels",
    "offerEditor.discountedProducts": "Kortingsproducten",
    "offerEditor.discountedProductsHelp":
      "Kies waarop deze korting van toepassing is. Gebruik Bladeren om resources uit je winkel te kiezen.",
    "offerEditor.productScope": "Productbereik",
    "offerEditor.quantityConditions": "Hoeveelheidsvoorwaarden instellen",
    "offerEditor.quantityConditionsHelp":
      "Kies hoe aankoophoeveelheidsniveaus worden geteld — winkelwagentotaal, per product, per variant of per collectie.",
    "offerEditor.quantityBasis": "Hoeveelheidsbasis",
    "offerEditor.schedule": "Planning",
    "offerEditor.targetCustomer": "Doelklant",
    "offerEditor.targetCustomerHelp":
      "Kies welke klanten deze korting kunnen gebruiken.",
    "offerEditor.customerType": "Klanttype",
    "offerEditor.cartCheckout": "Winkelwagen & checkout",
    "offerEditor.displayName": "Weergavenaam",
    "offerEditor.buttonSettings": "Knopinstellingen",
    "offerEditor.textButton": "Tekstknop",
    "offerEditor.buttonAction": "Knopactie",
    "offerEditor.pageUrl": "Pagina-URL",
    "offerEditor.advancedSettings": "Geavanceerde instellingen",
    "offerEditor.widgetText": "Widgettekst (storefront)",
    "offerEditor.widgetTextHelp":
      "Productpaginatekst. Lettertypen en kleuren: tabblad Uiterlijk.",
    "offerEditor.themeSetup": "Thema-instelling",
    "offerEditor.widgetAppearance": "Widgetuiterlijk (storefront)",
    "offerEditor.productPagePreview": "Productpagina - Voorbeeld",
    "offerEditor.desktopPreview": "Desktopvoorbeeld",
    "offerEditor.mobilePreview": "Mobiel voorbeeld",
    "common.upgradePlan": "Abonnement upgraden",
  },
  pl: {
    "offerEditor.createTitle": "Utwórz {type}",
    "offerEditor.editTitle": "Edytuj {type}",
    "offerEditor.quantityBreaks": "Rabaty ilościowe",
    "offerEditor.volumeDiscount": "Rabat wolumenowy",
    "offerEditor.offerTypes": "Typy ofert",
    "offerEditor.backA11y": "Wróć do typów ofert",
    "offerEditor.discard": "Odrzuć",
    "offerEditor.save": "Zapisz",
    "offerEditor.couldNotSave": "Nie udało się zapisać",
    "offerEditor.undo": "Cofnij",
    "offerEditor.redo": "Ponów",
    "offerEditor.tab.rules": "Ustawienia reguł",
    "offerEditor.tab.display": "Ustawienia wyświetlania",
    "offerEditor.tab.appearance": "Wygląd",
    "offerEditor.campaignDetails": "Szczegóły kampanii",
    "offerEditor.campaignName": "Nazwa kampanii",
    "offerEditor.campaignNameHelp":
      "Wewnętrzna nazwa tej oferty w aplikacji. Tekst widoczny dla klienta ustawiasz w Ustawieniach wyświetlania.",
    "offerEditor.discountRules": "Reguły rabatów",
    "offerEditor.discountedProducts": "Produkty z rabatem",
    "offerEditor.discountedProductsHelp":
      "Wybierz, do czego stosuje się ten rabat. Użyj Przeglądaj, aby wybrać zasoby ze sklepu.",
    "offerEditor.productScope": "Zakres produktów",
    "offerEditor.quantityConditions": "Ustaw warunki ilości",
    "offerEditor.quantityConditionsHelp":
      "Wybierz, jak liczone są progi ilości zakupu — suma koszyka, na produkt, na wariant lub na kolekcję.",
    "offerEditor.quantityBasis": "Podstawa ilości",
    "offerEditor.schedule": "Harmonogram",
    "offerEditor.targetCustomer": "Klient docelowy",
    "offerEditor.targetCustomerHelp":
      "Wybierz, którzy klienci mogą skorzystać z tego rabatu.",
    "offerEditor.customerType": "Typ klienta",
    "offerEditor.cartCheckout": "Koszyk i kasa",
    "offerEditor.displayName": "Nazwa wyświetlana",
    "offerEditor.buttonSettings": "Ustawienia przycisku",
    "offerEditor.textButton": "Przycisk tekstowy",
    "offerEditor.buttonAction": "Akcja przycisku",
    "offerEditor.pageUrl": "Adres URL strony",
    "offerEditor.advancedSettings": "Ustawienia zaawansowane",
    "offerEditor.widgetText": "Tekst widżetu (witryna)",
    "offerEditor.widgetTextHelp":
      "Tekst strony produktu. Czcionki i kolory: karta Wygląd.",
    "offerEditor.themeSetup": "Konfiguracja motywu",
    "offerEditor.widgetAppearance": "Wygląd widżetu (witryna)",
    "offerEditor.productPagePreview": "Strona produktu - Podgląd",
    "offerEditor.desktopPreview": "Podgląd pulpitu",
    "offerEditor.mobilePreview": "Podgląd mobilny",
    "common.upgradePlan": "Ulepsz plan",
  },
};

// Reuse NL/PL structure for remaining Scandinavian/Czech/PT/TH with adapted strings
offerEditorPacks.cs = {
  ...Object.fromEntries(
    Object.entries(offerEditorPacks.pl).map(([k, v]) => [k, v]),
  ),
  "offerEditor.createTitle": "Vytvořit {type}",
  "offerEditor.editTitle": "Upravit {type}",
  "offerEditor.quantityBreaks": "Množstevní slevy",
  "offerEditor.volumeDiscount": "Objemová sleva",
  "offerEditor.offerTypes": "Typy nabídek",
  "offerEditor.backA11y": "Zpět na typy nabídek",
  "offerEditor.discard": "Zahodit",
  "offerEditor.save": "Uložit",
  "offerEditor.couldNotSave": "Nepodařilo se uložit",
  "offerEditor.undo": "Zpět",
  "offerEditor.redo": "Znovu",
  "offerEditor.tab.rules": "Nastavení pravidel",
  "offerEditor.tab.display": "Nastavení zobrazení",
  "offerEditor.tab.appearance": "Vzhled",
  "offerEditor.campaignDetails": "Podrobnosti kampaně",
  "offerEditor.campaignName": "Název kampaně",
  "offerEditor.campaignNameHelp":
    "Interní název této nabídky v aplikaci. Text pro zákazníky nastavíte v Nastavení zobrazení.",
  "offerEditor.discountRules": "Pravidla slev",
  "offerEditor.discountedProducts": "Zlevněné produkty",
  "offerEditor.discountedProductsHelp":
    "Vyberte, na co se tato sleva vztahuje. Pomocí Procházet vyberte zdroje z obchodu.",
  "offerEditor.productScope": "Rozsah produktů",
  "offerEditor.quantityConditions": "Nastavit podmínky množství",
  "offerEditor.quantityConditionsHelp":
    "Zvolte, jak se počítají stupně nákupního množství — celý košík, na produkt, na variantu nebo na kolekci.",
  "offerEditor.quantityBasis": "Základ množství",
  "offerEditor.schedule": "Rozvrh",
  "offerEditor.targetCustomer": "Cílový zákazník",
  "offerEditor.targetCustomerHelp":
    "Vyberte, kteří zákazníci mohou tuto slevu použít.",
  "offerEditor.customerType": "Typ zákazníka",
  "offerEditor.cartCheckout": "Košík a pokladna",
  "offerEditor.displayName": "Zobrazovaný název",
  "offerEditor.buttonSettings": "Nastavení tlačítka",
  "offerEditor.textButton": "Textové tlačítko",
  "offerEditor.buttonAction": "Akce tlačítka",
  "offerEditor.pageUrl": "URL stránky",
  "offerEditor.advancedSettings": "Pokročilá nastavení",
  "offerEditor.widgetText": "Text widgetu (výloha)",
  "offerEditor.widgetTextHelp":
    "Text produktové stránky. Písma a barvy: karta Vzhled.",
  "offerEditor.themeSetup": "Nastavení tématu",
  "offerEditor.widgetAppearance": "Vzhled widgetu (výloha)",
  "offerEditor.productPagePreview": "Produktová stránka - Náhled",
  "offerEditor.desktopPreview": "Náhled na počítači",
  "offerEditor.mobilePreview": "Mobilní náhled",
  "common.upgradePlan": "Upgradovat plán",
};

offerEditorPacks.da = {
  ...offerEditorPacks.nl,
  "offerEditor.createTitle": "Opret {type}",
  "offerEditor.editTitle": "Rediger {type}",
  "offerEditor.quantityBreaks": "Mængderabatter",
  "offerEditor.volumeDiscount": "Volumenrabat",
  "offerEditor.offerTypes": "Tilbudstyper",
  "offerEditor.backA11y": "Tilbage til tilbudstyper",
  "offerEditor.discard": "Kassér",
  "offerEditor.save": "Gem",
  "offerEditor.couldNotSave": "Kunne ikke gemme",
  "offerEditor.undo": "Fortryd",
  "offerEditor.redo": "Gentag",
  "offerEditor.tab.rules": "Regelindstillinger",
  "offerEditor.tab.display": "Visningsindstillinger",
  "offerEditor.tab.appearance": "Udseende",
  "offerEditor.campaignDetails": "Kampagnedetaljer",
  "offerEditor.campaignName": "Kampagnenavn",
  "offerEditor.campaignNameHelp":
    "Internt navn for dette tilbud i appen. Kundevendt tekst indstilles under Visningsindstillinger.",
  "offerEditor.discountRules": "Rabatregler",
  "offerEditor.discountedProducts": "Produkter med rabat",
  "offerEditor.discountedProductsHelp":
    "Vælg, hvad denne rabat gælder for. Brug Gennemse til at vælge ressourcer fra din butik.",
  "offerEditor.productScope": "Produktomfang",
  "offerEditor.quantityConditions": "Angiv mængdebetingelser",
  "offerEditor.quantityConditionsHelp":
    "Vælg, hvordan købsmængdetrin tælles — kurvtotal, pr. produkt, pr. variant eller pr. kollektion.",
  "offerEditor.quantityBasis": "Mængdegrundlag",
  "offerEditor.schedule": "Tidsplan",
  "offerEditor.targetCustomer": "Målgruppe",
  "offerEditor.targetCustomerHelp":
    "Vælg, hvilke kunder der kan bruge denne rabat.",
  "offerEditor.customerType": "Kundetype",
  "offerEditor.cartCheckout": "Kurv & checkout",
  "offerEditor.displayName": "Visningsnavn",
  "offerEditor.buttonSettings": "Knapindstillinger",
  "offerEditor.textButton": "Tekstknap",
  "offerEditor.buttonAction": "Knaphandling",
  "offerEditor.pageUrl": "Side-URL",
  "offerEditor.advancedSettings": "Avancerede indstillinger",
  "offerEditor.widgetText": "Widget-tekst (butik)",
  "offerEditor.widgetTextHelp":
    "Produktsidetekst. Skrifttyper og farver: fanen Udseende.",
  "offerEditor.themeSetup": "Temaopsætning",
  "offerEditor.widgetAppearance": "Widget-udseende (butik)",
  "offerEditor.productPagePreview": "Produktside - Forhåndsvisning",
  "offerEditor.desktopPreview": "Desktop-forhåndsvisning",
  "offerEditor.mobilePreview": "Mobil forhåndsvisning",
  "common.upgradePlan": "Opgrader plan",
};

offerEditorPacks.sv = {
  ...offerEditorPacks.da,
  "offerEditor.createTitle": "Skapa {type}",
  "offerEditor.editTitle": "Redigera {type}",
  "offerEditor.quantityBreaks": "Mängdrabatter",
  "offerEditor.volumeDiscount": "Volymrabatt",
  "offerEditor.offerTypes": "Erbjudandetyper",
  "offerEditor.backA11y": "Tillbaka till erbjudandetyper",
  "offerEditor.discard": "Kassera",
  "offerEditor.save": "Spara",
  "offerEditor.couldNotSave": "Kunde inte spara",
  "offerEditor.undo": "Ångra",
  "offerEditor.redo": "Gör om",
  "offerEditor.tab.rules": "Regelinställningar",
  "offerEditor.tab.display": "Visningsinställningar",
  "offerEditor.tab.appearance": "Utseende",
  "offerEditor.campaignDetails": "Kampanjdetaljer",
  "offerEditor.campaignName": "Kampanjnamn",
  "offerEditor.campaignNameHelp":
    "Internt namn för detta erbjudande i appen. Kundvänd text ställs in under Visningsinställningar.",
  "offerEditor.discountRules": "Rabattregler",
  "offerEditor.discountedProducts": "Rabatterade produkter",
  "offerEditor.discountedProductsHelp":
    "Välj vad denna rabatt gäller. Använd Bläddra för att välja resurser från din butik.",
  "offerEditor.productScope": "Produktomfattning",
  "offerEditor.quantityConditions": "Ange kvantitetsvillkor",
  "offerEditor.quantityConditionsHelp":
    "Välj hur köpmängdsnivåer räknas — varukorgstotal, per produkt, per variant eller per kollektion.",
  "offerEditor.quantityBasis": "Kvantitetsbas",
  "offerEditor.schedule": "Schema",
  "offerEditor.targetCustomer": "Målgrupp",
  "offerEditor.targetCustomerHelp":
    "Välj vilka kunder som kan använda denna rabatt.",
  "offerEditor.customerType": "Kundtyp",
  "offerEditor.cartCheckout": "Varukorg & kassa",
  "offerEditor.displayName": "Visningsnamn",
  "offerEditor.buttonSettings": "Knappinställningar",
  "offerEditor.textButton": "Textknapp",
  "offerEditor.buttonAction": "Knappåtgärd",
  "offerEditor.pageUrl": "Sid-URL",
  "offerEditor.advancedSettings": "Avancerade inställningar",
  "offerEditor.widgetText": "Widgettext (butik)",
  "offerEditor.widgetTextHelp":
    "Produktsidetext. Typsnitt och färger: fliken Utseende.",
  "offerEditor.themeSetup": "Temainställning",
  "offerEditor.widgetAppearance": "Widgetutseende (butik)",
  "offerEditor.productPagePreview": "Produktsida - Förhandsgranskning",
  "offerEditor.desktopPreview": "Skrivbordsförhandsgranskning",
  "offerEditor.mobilePreview": "Mobil förhandsgranskning",
  "common.upgradePlan": "Uppgradera plan",
};

offerEditorPacks.nb = {
  ...offerEditorPacks.sv,
  "offerEditor.createTitle": "Opprett {type}",
  "offerEditor.editTitle": "Rediger {type}",
  "offerEditor.quantityBreaks": "Mengderabatter",
  "offerEditor.volumeDiscount": "Volumrabatt",
  "offerEditor.offerTypes": "Tilbudstyper",
  "offerEditor.backA11y": "Tilbake til tilbudstyper",
  "offerEditor.discard": "Forkast",
  "offerEditor.save": "Lagre",
  "offerEditor.couldNotSave": "Kunne ikke lagre",
  "offerEditor.undo": "Angre",
  "offerEditor.redo": "Gjør om",
  "offerEditor.tab.rules": "Regelinnstillinger",
  "offerEditor.tab.display": "Visningsinnstillinger",
  "offerEditor.tab.appearance": "Utseende",
  "offerEditor.campaignDetails": "Kampanjedetaljer",
  "offerEditor.campaignName": "Kampanjenavn",
  "offerEditor.campaignNameHelp":
    "Internt navn for dette tilbudet i appen. Kundevendt tekst settes under Visningsinnstillinger.",
  "offerEditor.discountRules": "Rabattregler",
  "offerEditor.discountedProducts": "Produkter med rabatt",
  "offerEditor.discountedProductsHelp":
    "Velg hva denne rabatten gjelder for. Bruk Bla gjennom for å velge ressurser fra butikken.",
  "offerEditor.productScope": "Produktomfang",
  "offerEditor.quantityConditions": "Angi mengdebetingelser",
  "offerEditor.quantityConditionsHelp":
    "Velg hvordan kjøpsmengdenivåer telles — handlekurvtotal, per produkt, per variant eller per kolleksjon.",
  "offerEditor.quantityBasis": "Mengdegrunnlag",
  "offerEditor.schedule": "Tidsplan",
  "offerEditor.targetCustomer": "Målgruppe",
  "offerEditor.targetCustomerHelp":
    "Velg hvilke kunder som kan bruke denne rabatten.",
  "offerEditor.customerType": "Kundetype",
  "offerEditor.cartCheckout": "Handlekurv & checkout",
  "offerEditor.displayName": "Visningsnavn",
  "offerEditor.buttonSettings": "Knappinnstillinger",
  "offerEditor.textButton": "Tekstknapp",
  "offerEditor.buttonAction": "Knapphandling",
  "offerEditor.pageUrl": "Side-URL",
  "offerEditor.advancedSettings": "Avanserte innstillinger",
  "offerEditor.widgetText": "Widget-tekst (butikk)",
  "offerEditor.widgetTextHelp":
    "Produktsidetekst. Skrifter og farger: fanen Utseende.",
  "offerEditor.themeSetup": "Temainnstilling",
  "offerEditor.widgetAppearance": "Widget-utseende (butikk)",
  "offerEditor.productPagePreview": "Produktside - Forhåndsvisning",
  "offerEditor.desktopPreview": "Skrivebordsforhåndsvisning",
  "offerEditor.mobilePreview": "Mobil forhåndsvisning",
  "common.upgradePlan": "Oppgrader plan",
};

offerEditorPacks.fi = {
  ...offerEditorPacks.nl,
  "offerEditor.createTitle": "Luo {type}",
  "offerEditor.editTitle": "Muokkaa {type}",
  "offerEditor.quantityBreaks": "Määräalennukset",
  "offerEditor.volumeDiscount": "Volyymialennus",
  "offerEditor.offerTypes": "Tarjoustyypit",
  "offerEditor.backA11y": "Takaisin tarjoustyyppeihin",
  "offerEditor.discard": "Hylkää",
  "offerEditor.save": "Tallenna",
  "offerEditor.couldNotSave": "Tallennus epäonnistui",
  "offerEditor.undo": "Kumoa",
  "offerEditor.redo": "Tee uudelleen",
  "offerEditor.tab.rules": "Sääntöasetukset",
  "offerEditor.tab.display": "Näyttöasetukset",
  "offerEditor.tab.appearance": "Ulkoasu",
  "offerEditor.campaignDetails": "Kampanjan tiedot",
  "offerEditor.campaignName": "Kampanjan nimi",
  "offerEditor.campaignNameHelp":
    "Tämän tarjouksen sisäinen nimi sovelluksessa. Asiakkaalle näkyvä teksti asetetaan Näyttöasetuksissa.",
  "offerEditor.discountRules": "Alennussäännöt",
  "offerEditor.discountedProducts": "Alennetut tuotteet",
  "offerEditor.discountedProductsHelp":
    "Valitse, mihin tämä alennus koskee. Käytä Selaa-toimintoa valitaksesi resursseja kaupastasi.",
  "offerEditor.productScope": "Tuotealue",
  "offerEditor.quantityConditions": "Aseta määrän ehdot",
  "offerEditor.quantityConditionsHelp":
    "Valitse, miten ostomääräportaat lasketaan — ostoskorin summa, per tuote, per variantti tai per kokoelma.",
  "offerEditor.quantityBasis": "Määrän peruste",
  "offerEditor.schedule": "Aikataulu",
  "offerEditor.targetCustomer": "Kohdeasiakas",
  "offerEditor.targetCustomerHelp":
    "Valitse, mitkä asiakkaat voivat käyttää tätä alennusta.",
  "offerEditor.customerType": "Asiakastyyppi",
  "offerEditor.cartCheckout": "Ostoskori ja kassa",
  "offerEditor.displayName": "Näyttönimi",
  "offerEditor.buttonSettings": "Painikeasetukset",
  "offerEditor.textButton": "Tekstipainike",
  "offerEditor.buttonAction": "Painikkeen toiminto",
  "offerEditor.pageUrl": "Sivun URL",
  "offerEditor.advancedSettings": "Lisäasetukset",
  "offerEditor.widgetText": "Widget-teksti (kauppa)",
  "offerEditor.widgetTextHelp":
    "Tuotesivun teksti. Fontit ja värit: Ulkoasu-välilehti.",
  "offerEditor.themeSetup": "Teeman asetus",
  "offerEditor.widgetAppearance": "Widgetin ulkoasu (kauppa)",
  "offerEditor.productPagePreview": "Tuotesivu - Esikatselu",
  "offerEditor.desktopPreview": "Työpöytäesikatselu",
  "offerEditor.mobilePreview": "Mobiiliesikatselu",
  "common.upgradePlan": "Päivitä suunnitelma",
};

offerEditorPacks["pt-PT"] = {
  ...offerEditorPacks.es,
  "offerEditor.createTitle": "Criar {type}",
  "offerEditor.editTitle": "Editar {type}",
  "offerEditor.quantityBreaks": "Descontos por quantidade",
  "offerEditor.volumeDiscount": "Desconto de volume",
  "offerEditor.offerTypes": "Tipos de oferta",
  "offerEditor.backA11y": "Voltar aos tipos de oferta",
  "offerEditor.discard": "Descartar",
  "offerEditor.save": "Guardar",
  "offerEditor.couldNotSave": "Não foi possível guardar",
  "offerEditor.undo": "Anular",
  "offerEditor.redo": "Refazer",
  "offerEditor.tab.rules": "Definições de regras",
  "offerEditor.tab.display": "Definições de visualização",
  "offerEditor.tab.appearance": "Aparência",
  "offerEditor.campaignDetails": "Detalhes da campanha",
  "offerEditor.campaignName": "Nome da campanha",
  "offerEditor.campaignNameHelp":
    "Nome interno desta oferta na app. O texto visível ao cliente é definido em Definições de visualização.",
  "offerEditor.discountRules": "Regras de desconto",
  "offerEditor.discountedProducts": "Produtos com desconto",
  "offerEditor.discountedProductsHelp":
    "Escolha a que se aplica este desconto. Use Procurar para selecionar recursos da loja.",
  "offerEditor.productScope": "Âmbito de produtos",
  "offerEditor.quantityConditions": "Definir condições de quantidade",
  "offerEditor.quantityConditionsHelp":
    "Escolha como contam os níveis de quantidade de compra — total do carrinho, por produto, por variante ou por coleção.",
  "offerEditor.quantityBasis": "Base de quantidade",
  "offerEditor.schedule": "Agendamento",
  "offerEditor.targetCustomer": "Cliente-alvo",
  "offerEditor.targetCustomerHelp":
    "Escolha que clientes podem usar este desconto.",
  "offerEditor.customerType": "Tipo de cliente",
  "offerEditor.cartCheckout": "Carrinho e checkout",
  "offerEditor.displayName": "Nome de apresentação",
  "offerEditor.buttonSettings": "Definições do botão",
  "offerEditor.textButton": "Botão de texto",
  "offerEditor.buttonAction": "Ação do botão",
  "offerEditor.pageUrl": "URL da página",
  "offerEditor.advancedSettings": "Definições avançadas",
  "offerEditor.widgetText": "Texto do widget (loja)",
  "offerEditor.widgetTextHelp":
    "Texto da página do produto. Tipos de letra e cores: separador Aparência.",
  "offerEditor.themeSetup": "Configuração do tema",
  "offerEditor.widgetAppearance": "Aparência do widget (loja)",
  "offerEditor.productPagePreview": "Página do produto - Pré-visualização",
  "offerEditor.desktopPreview": "Pré-visualização no computador",
  "offerEditor.mobilePreview": "Pré-visualização no telemóvel",
  "common.upgradePlan": "Atualizar plano",
};
offerEditorPacks["pt-BR"] = {
  ...offerEditorPacks["pt-PT"],
  "offerEditor.save": "Salvar",
  "offerEditor.couldNotSave": "Não foi possível salvar",
  "offerEditor.tab.rules": "Configurações de regras",
  "offerEditor.tab.display": "Configurações de exibição",
  "offerEditor.campaignNameHelp":
    "Nome interno desta oferta no app. O texto visível ao cliente é definido em Configurações de exibição.",
  "offerEditor.discountedProductsHelp":
    "Escolha a que se aplica este desconto. Use Navegar para selecionar recursos da loja.",
  "common.upgradePlan": "Atualizar plano",
};
offerEditorPacks.pt = { ...offerEditorPacks["pt-PT"] };

offerEditorPacks.th = {
  ...offerEditorPacks.nl,
  "offerEditor.createTitle": "สร้าง {type}",
  "offerEditor.editTitle": "แก้ไข {type}",
  "offerEditor.quantityBreaks": "ส่วนลดตามปริมาณ",
  "offerEditor.volumeDiscount": "ส่วนลดวอลุ่ม",
  "offerEditor.offerTypes": "ประเภทข้อเสนอ",
  "offerEditor.backA11y": "กลับไปที่ประเภทข้อเสนอ",
  "offerEditor.discard": "ละทิ้ง",
  "offerEditor.save": "บันทึก",
  "offerEditor.couldNotSave": "ไม่สามารถบันทึกได้",
  "offerEditor.undo": "เลิกทำ",
  "offerEditor.redo": "ทำซ้ำ",
  "offerEditor.tab.rules": "การตั้งค่ากฎ",
  "offerEditor.tab.display": "การตั้งค่าการแสดงผล",
  "offerEditor.tab.appearance": "ลักษณะ",
  "offerEditor.campaignDetails": "รายละเอียดแคมเปญ",
  "offerEditor.campaignName": "ชื่อแคมเปญ",
  "offerEditor.campaignNameHelp":
    "ชื่อภายในของข้อเสนอนี้ในแอป ข้อความที่ลูกค้าเห็นตั้งค่าได้ใน การตั้งค่าการแสดงผล",
  "offerEditor.discountRules": "กฎส่วนลด",
  "offerEditor.discountedProducts": "สินค้าที่มีส่วนลด",
  "offerEditor.discountedProductsHelp":
    "เลือกว่าส่วนลดนี้ใช้กับอะไร ใช้ เรียกดู เพื่อเลือกทรัพยากรจากร้านของคุณ",
  "offerEditor.productScope": "ขอบเขตสินค้า",
  "offerEditor.quantityConditions": "ตั้งเงื่อนไขปริมาณ",
  "offerEditor.quantityConditionsHelp":
    "เลือกวิธีนับระดับปริมาณการซื้อ — รวมตะกร้า ต่อสินค้า ต่อตัวเลือก หรือต่อคอลเลกชัน",
  "offerEditor.quantityBasis": "เกณฑ์ปริมาณ",
  "offerEditor.schedule": "กำหนดเวลา",
  "offerEditor.targetCustomer": "ลูกค้าเป้าหมาย",
  "offerEditor.targetCustomerHelp":
    "เลือกว่าลูกค้าคนใดสามารถใช้ส่วนลดนี้ได้",
  "offerEditor.customerType": "ประเภทลูกค้า",
  "offerEditor.cartCheckout": "ตะกร้าและเช็คเอาต์",
  "offerEditor.displayName": "ชื่อที่แสดง",
  "offerEditor.buttonSettings": "การตั้งค่าปุ่ม",
  "offerEditor.textButton": "ปุ่มข้อความ",
  "offerEditor.buttonAction": "การทำงานของปุ่ม",
  "offerEditor.pageUrl": "URL หน้า",
  "offerEditor.advancedSettings": "การตั้งค่าขั้นสูง",
  "offerEditor.widgetText": "ข้อความวิดเจ็ต (หน้าร้าน)",
  "offerEditor.widgetTextHelp":
    "ข้อความหน้าสินค้า แบบอักษรและสี: แท็บลักษณะ",
  "offerEditor.themeSetup": "การตั้งค่าธีม",
  "offerEditor.widgetAppearance": "ลักษณะวิดเจ็ต (หน้าร้าน)",
  "offerEditor.productPagePreview": "หน้าสินค้า - ตัวอย่าง",
  "offerEditor.desktopPreview": "ตัวอย่างเดสก์ท็อป",
  "offerEditor.mobilePreview": "ตัวอย่างมือถือ",
  "common.upgradePlan": "อัปเกรดแผน",
};

function mergeFile(locale, pack) {
  const file = path.join(adminDir, `${locale}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`skip missing ${locale}.json`);
    return 0;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = 0;
  for (const [k, v] of Object.entries(pack)) {
    if (data[k] !== v) {
      data[k] = v;
      changed++;
    }
  }
  if (changed) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  }
  return changed;
}

let total = 0;
for (const [locale, pack] of Object.entries(settingsAdmin)) {
  const n = mergeFile(locale, pack);
  console.log(`settings.adminLanguage ${locale}: ${n} keys`);
  total += n;
}
for (const [locale, pack] of Object.entries(pricingPacks)) {
  const n = mergeFile(locale, pack);
  console.log(`pricing ${locale}: ${n} keys`);
  total += n;
}
for (const [locale, pack] of Object.entries(offerEditorPacks)) {
  const n = mergeFile(locale, pack);
  console.log(`offerEditor ${locale}: ${n} keys`);
  total += n;
}

console.log(`Done. Updated ${total} key assignments.`);
