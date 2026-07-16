import polarisStylesUrl from "@shopify/polaris/build/esm/styles.css?url";
import polarisButtonPressedUrl from "../styles/polaris-button-pressed.css?url";
import tailwindStylesUrl from "../styles/tailwind.css?url";
import type {
  HeadersFunction,
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  Outlet,
  data,
  redirect,
  useLoaderData,
  useLocation,
  useNavigate,
  useRouteError,
} from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useAppBridge } from "@shopify/app-bridge-react";

import { APP_DISPLAY_NAME } from "../branding";
import { CrispChat } from "../components/CrispChat";
import {
  AdminI18nProvider,
  useAdminI18n,
} from "../components/AdminI18nProvider";
import {
  adminEmbeddedPath,
  hasEphemeralBillingParams,
  stripEphemeralBillingSearch,
} from "../utils/adminEmbeddedPath";
import { withShopFromEmbeddedHost } from "../utils/embeddedShop.server";
import {
  adminLanguageCookieHeader,
  readAdminLanguageCookie,
  type AdminLanguageCode,
} from "../utils/adminLanguage";
import { resolveAdminLanguage } from "../utils/adminLanguage.server";

/**
 * Re-register critical CSS for the embedded admin shell so SPA transitions
 * still associate styles with the layout (helps when root link order races).
 *
 * Tailwind must be linked here (not only on `root.tsx`): `/app/*` routes are
 * separate client entries and do not pull in the root route CSS chunk, so
 * utilities for e.g. `QuantityBreaksTailwindPreview` would otherwise never load.
 */
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStylesUrl },
  { rel: "stylesheet", href: polarisButtonPressedUrl },
  { rel: "preload", href: tailwindStylesUrl, as: "style" },
  { rel: "stylesheet", href: tailwindStylesUrl },
];

export const meta: MetaFunction = () => [{ title: APP_DISPLAY_NAME }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = withShopFromEmbeddedHost(new URL(request.url));
  if (url.toString() !== request.url) {
    throw redirect(`${url.pathname}?${url.searchParams.toString()}`);
  }

  const cookieLang = readAdminLanguageCookie(request.headers.get("Cookie"));
  const shop = url.searchParams.get("shop");
  // Cookie is refreshed on every /app response + language save — prefer it to
  // skip a DB round-trip on the shared layout (biggest win for all /app/*).
  const adminLanguage: AdminLanguageCode =
    cookieLang ?? (shop ? await resolveAdminLanguage(shop) : "auto");

  // eslint-disable-next-line no-undef
  return data(
    {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      adminLanguage,
    },
    {
      headers: {
        "Set-Cookie": adminLanguageCookieHeader(adminLanguage),
      },
    },
  );
};

/** apiKey is static — skip re-auth on every /app/* child navigation (Create/Edit). */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod !== "GET") {
    return defaultShouldRevalidate;
  }
  if (
    currentUrl.pathname.startsWith("/app") &&
    nextUrl.pathname.startsWith("/app")
  ) {
    return false;
  }
  return defaultShouldRevalidate;
}

function PolarisLocaleBridge({ children }: { children: ReactNode }) {
  const shopify = useAppBridge();
  const { adminLanguage } = useAdminI18n();
  const [i18n, setI18n] = useState(en);

  useEffect(() => {
    let cancelled = false;
    let shopifyLocale: string | null = null;
    try {
      const locale = shopify?.config?.locale;
      shopifyLocale = typeof locale === "string" ? locale : null;
    } catch {
      shopifyLocale = null;
    }

    void import("../utils/polarisLocale.client")
      .then(({ loadPolarisI18n }) =>
        loadPolarisI18n(adminLanguage, shopifyLocale),
      )
      .then((next) => {
        if (!cancelled) setI18n(next as typeof en);
      })
      .catch(() => {
        /* keep English fallback */
      });

    return () => {
      cancelled = true;
    };
  }, [adminLanguage, shopify]);

  return <PolarisAppProvider i18n={i18n}>{children}</PolarisAppProvider>;
}

function AppNav() {
  const { t, localeKey } = useAdminI18n();
  const { search } = useLocation();
  const navSearch = stripEphemeralBillingSearch(search);
  const homeHref = adminEmbeddedPath("/app", navSearch);
  const offersHref = adminEmbeddedPath("/app/offers", navSearch);
  const analyticsHref = adminEmbeddedPath("/app/analytics", navSearch);
  const pricingHref = adminEmbeddedPath("/app/pricing", navSearch);
  const settingsHref = adminEmbeddedPath("/app/settings", navSearch);

  // rel="home" sets the app-name click target to /app and hides that link from the sidebar.
  return (
    <s-app-nav key={localeKey}>
      <s-link href={homeHref} rel="home">
        {t("nav.home")}
      </s-link>
      <s-link href={analyticsHref}>{t("nav.analytics")}</s-link>
      <s-link href={offersHref}>{t("nav.offers")}</s-link>
      <s-link href={pricingHref}>{t("nav.pricing")}</s-link>
      <s-link href={settingsHref}>{t("nav.settings")}</s-link>
    </s-app-nav>
  );
}

export default function App() {
  const { apiKey, adminLanguage } = useLoaderData<typeof loader>();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasEphemeralBillingParams(search)) return;
    // Pricing still needs `billing=success` for the first loader+toast pass;
    // it clears its own URL after showing the toast.
    if (pathname.startsWith("/app/pricing")) return;
    const cleaned = stripEphemeralBillingSearch(search);
    navigate(`${pathname}${cleaned}`, { replace: true });
  }, [navigate, pathname, search]);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AdminI18nProvider initialAdminLanguage={adminLanguage}>
        <PolarisLocaleBridge>
          <AppNav />
          <Outlet />
          <CrispChat />
        </PolarisLocaleBridge>
      </AdminI18nProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
