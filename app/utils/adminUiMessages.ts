/**
 * Offrefy admin UI copy (embedded Shopify Admin).
 * Strings live in `app/locales/admin/*.json` — separate from storefront translations.
 *
 * Only English is eagerly bundled. Other locales load on demand so the admin
 * client chunk stays small (each pack is ~650 keys including country names).
 */

import en from "../locales/admin/en.json";

export type AdminUiMessageKey = keyof typeof en;
export type AdminUiMessages = Record<AdminUiMessageKey, string>;

export const ADMIN_UI_EN = en as AdminUiMessages;

type LocalePackModule = { default: Record<string, string> };

const PACK_LOADERS: Record<string, () => Promise<LocalePackModule>> = {
  tr: () => import("../locales/admin/tr.json"),
  fr: () => import("../locales/admin/fr.json"),
  de: () => import("../locales/admin/de.json"),
  es: () => import("../locales/admin/es.json"),
  it: () => import("../locales/admin/it.json"),
  nl: () => import("../locales/admin/nl.json"),
  pt: () => import("../locales/admin/pt.json"),
  "pt-PT": () => import("../locales/admin/pt-PT.json"),
  "pt-BR": () => import("../locales/admin/pt-BR.json"),
  pl: () => import("../locales/admin/pl.json"),
  cs: () => import("../locales/admin/cs.json"),
  sv: () => import("../locales/admin/sv.json"),
  da: () => import("../locales/admin/da.json"),
  fi: () => import("../locales/admin/fi.json"),
  nb: () => import("../locales/admin/nb.json"),
  ja: () => import("../locales/admin/ja.json"),
  ko: () => import("../locales/admin/ko.json"),
  th: () => import("../locales/admin/th.json"),
  vi: () => import("../locales/admin/vi.json"),
  "zh-CN": () => import("../locales/admin/zh-CN.json"),
  "zh-TW": () => import("../locales/admin/zh-TW.json"),
};

const packCache = new Map<string, AdminUiMessages>([["en", ADMIN_UI_EN]]);
const packInflight = new Map<string, Promise<AdminUiMessages>>();

function mergePack(partial: Record<string, string>): AdminUiMessages {
  return { ...ADMIN_UI_EN, ...(partial as AdminUiMessages) };
}

/** Sync: returns cached pack or English fallback (never blocks). */
export function getAdminUiMessages(localeKey: string): AdminUiMessages {
  return packCache.get(localeKey) ?? ADMIN_UI_EN;
}

/** Async: loads + caches a locale pack (merged over English). */
export async function loadAdminUiMessages(
  localeKey: string,
): Promise<AdminUiMessages> {
  const cached = packCache.get(localeKey);
  if (cached) return cached;
  if (localeKey === "en") return ADMIN_UI_EN;

  const loader = PACK_LOADERS[localeKey];
  if (!loader) return ADMIN_UI_EN;

  const inflight = packInflight.get(localeKey);
  if (inflight) return inflight;

  const promise = loader()
    .then((mod) => {
      const merged = mergePack(mod.default ?? {});
      packCache.set(localeKey, merged);
      packInflight.delete(localeKey);
      return merged;
    })
    .catch(() => {
      packInflight.delete(localeKey);
      return ADMIN_UI_EN;
    });

  packInflight.set(localeKey, promise);
  return promise;
}

export function resolveAdminUiLocaleKey(
  adminLanguage: string,
  shopifyAdminLocale?: string | null,
): string {
  const preferred =
    !adminLanguage || adminLanguage === "auto"
      ? shopifyAdminLocale || "en"
      : adminLanguage;

  const raw = String(preferred).trim();
  if (!raw) return "en";
  if (raw === "en" || PACK_LOADERS[raw]) return raw;

  const lower = raw.toLowerCase().replace(/_/g, "-");
  if (lower.startsWith("pt-br")) return "pt-BR";
  if (lower.startsWith("pt")) return "pt-PT";
  if (lower.startsWith("nb") || lower.startsWith("nn") || lower.startsWith("no")) {
    return "nb";
  }
  if (
    lower.startsWith("zh-tw") ||
    lower.startsWith("zh-hant") ||
    lower.startsWith("zh-hk")
  ) {
    return "zh-TW";
  }
  if (lower.startsWith("zh")) return "zh-CN";

  // Nearest app pack when Shopify Admin locale has no dedicated Offrefy pack
  const europeanNearestPack: Record<string, string> = {
    sk: "cs",
    ca: "es",
    lb: "de",
    rm: "de",
    gsw: "de",
  };

  const base = lower.split("-")[0] ?? "en";
  if (base === "en" || PACK_LOADERS[base]) return base;
  if (europeanNearestPack[base] && PACK_LOADERS[europeanNearestPack[base]]) {
    return europeanNearestPack[base];
  }
  return "en";
}

export function translateAdminUi(
  messages: AdminUiMessages,
  key: AdminUiMessageKey,
  vars?: Record<string, string | number | null | undefined>,
): string {
  let text = messages[key] ?? ADMIN_UI_EN[key] ?? String(key);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value ?? ""));
    }
  }
  return text;
}
