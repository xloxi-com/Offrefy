import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  ADMIN_LANGUAGE_STORAGE_KEY,
  normalizeAdminLanguage,
  type AdminLanguageCode,
} from "../utils/adminLanguage";
import {
  ADMIN_UI_EN,
  getAdminUiMessages,
  loadAdminUiMessages,
  resolveAdminUiLocaleKey,
  translateAdminUi,
  type AdminUiMessageKey,
  type AdminUiMessages,
} from "../utils/adminUiMessages";

type AdminI18nContextValue = {
  adminLanguage: AdminLanguageCode;
  localeKey: string;
  messages: AdminUiMessages;
  t: (
    key: AdminUiMessageKey,
    vars?: Record<string, string | number | null | undefined>,
  ) => string;
  setAdminLanguage: (next: AdminLanguageCode) => void;
};

const AdminI18nContext = createContext<AdminI18nContextValue | null>(null);

function readShopifyAdminLocale(shopify: ReturnType<typeof useAppBridge>): string | null {
  try {
    const locale = shopify?.config?.locale;
    return typeof locale === "string" ? locale : null;
  } catch {
    // App Bridge throws if config is read during SSR.
    return null;
  }
}

export function AdminI18nProvider({
  initialAdminLanguage,
  children,
}: {
  initialAdminLanguage: AdminLanguageCode;
  children: ReactNode;
}) {
  const shopify = useAppBridge();
  const [adminLanguage, setAdminLanguageState] = useState<AdminLanguageCode>(
    initialAdminLanguage,
  );
  const [shopifyLocale, setShopifyLocale] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminUiMessages>(ADMIN_UI_EN);

  // Cookie/DB from the layout loader is source of truth on load / revalidate.
  // Do not let a stale localStorage value (e.g. leftover zh-CN from testing)
  // override Auto/English after a full reload.
  useEffect(() => {
    const normalized = normalizeAdminLanguage(initialAdminLanguage);
    setAdminLanguageState(normalized);
    try {
      window.localStorage.setItem(ADMIN_LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      /* ignore */
    }
  }, [initialAdminLanguage]);

  useEffect(() => {
    setShopifyLocale(readShopifyAdminLocale(shopify));

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setAdminLanguageState(normalizeAdminLanguage(detail));
    };
    window.addEventListener("offrefy:admin-language", onChange);
    return () => window.removeEventListener("offrefy:admin-language", onChange);
  }, [shopify]);

  // App Bridge config.locale can populate after first paint — retry briefly for Auto.
  useEffect(() => {
    if (adminLanguage !== "auto") return;
    if (shopifyLocale) return;

    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      const next = readShopifyAdminLocale(shopify);
      if (next) {
        setShopifyLocale(next);
        window.clearInterval(id);
      } else if (attempts >= 20) {
        window.clearInterval(id);
      }
    }, 100);

    return () => window.clearInterval(id);
  }, [adminLanguage, shopify, shopifyLocale]);

  const setAdminLanguage = useCallback((next: AdminLanguageCode) => {
    const normalized = normalizeAdminLanguage(next);
    setAdminLanguageState(normalized);
    try {
      window.localStorage.setItem(ADMIN_LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent("offrefy:admin-language", { detail: normalized }),
    );
  }, []);

  const localeKey = useMemo(
    () => resolveAdminUiLocaleKey(adminLanguage, shopifyLocale),
    [adminLanguage, shopifyLocale],
  );

  // Paint with English (or cached pack) immediately; swap when locale chunk loads.
  useEffect(() => {
    setMessages(getAdminUiMessages(localeKey));
    let cancelled = false;
    void loadAdminUiMessages(localeKey).then((next) => {
      if (!cancelled) setMessages(next);
    });
    return () => {
      cancelled = true;
    };
  }, [localeKey]);

  const t = useCallback(
    (
      key: AdminUiMessageKey,
      vars?: Record<string, string | number | null | undefined>,
    ) => translateAdminUi(messages, key, vars),
    [messages],
  );

  const value = useMemo(
    () => ({
      adminLanguage,
      localeKey,
      messages,
      t,
      setAdminLanguage,
    }),
    [adminLanguage, localeKey, messages, t, setAdminLanguage],
  );

  return (
    <AdminI18nContext.Provider value={value}>
      {children}
    </AdminI18nContext.Provider>
  );
}

export function useAdminI18n(): AdminI18nContextValue {
  const ctx = useContext(AdminI18nContext);
  if (!ctx) {
    throw new Error("useAdminI18n must be used within AdminI18nProvider");
  }
  return ctx;
}
