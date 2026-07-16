import type en from "@shopify/polaris/locales/en.json";
import {
  resolvePolarisLocaleKey,
  type AdminLanguageCode,
} from "./adminLanguage";

type PolarisI18n = typeof en;

const loaders: Record<string, () => Promise<{ default: PolarisI18n }>> = {
  cs: () => import("@shopify/polaris/locales/cs.json"),
  da: () => import("@shopify/polaris/locales/da.json"),
  de: () => import("@shopify/polaris/locales/de.json"),
  en: () => import("@shopify/polaris/locales/en.json"),
  es: () => import("@shopify/polaris/locales/es.json"),
  fi: () => import("@shopify/polaris/locales/fi.json"),
  fr: () => import("@shopify/polaris/locales/fr.json"),
  it: () => import("@shopify/polaris/locales/it.json"),
  ja: () => import("@shopify/polaris/locales/ja.json"),
  ko: () => import("@shopify/polaris/locales/ko.json"),
  nb: () => import("@shopify/polaris/locales/nb.json"),
  nl: () => import("@shopify/polaris/locales/nl.json"),
  pl: () => import("@shopify/polaris/locales/pl.json"),
  "pt-BR": () => import("@shopify/polaris/locales/pt-BR.json"),
  "pt-PT": () => import("@shopify/polaris/locales/pt-PT.json"),
  sv: () => import("@shopify/polaris/locales/sv.json"),
  th: () => import("@shopify/polaris/locales/th.json"),
  tr: () => import("@shopify/polaris/locales/tr.json"),
  vi: () => import("@shopify/polaris/locales/vi.json"),
  "zh-CN": () => import("@shopify/polaris/locales/zh-CN.json"),
  "zh-TW": () => import("@shopify/polaris/locales/zh-TW.json"),
};

const cache = new Map<string, PolarisI18n>();

export async function loadPolarisI18n(
  adminLanguage: AdminLanguageCode | string,
  shopifyAdminLocale?: string | null,
): Promise<PolarisI18n> {
  const key = resolvePolarisLocaleKey(adminLanguage, shopifyAdminLocale);
  const cached = cache.get(key);
  if (cached) return cached;

  const loader = loaders[key] ?? loaders.en;
  const mod = await loader();
  const i18n = mod.default;
  cache.set(key, i18n);
  return i18n;
}
