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
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { APP_DISPLAY_NAME } from "../branding";
import { authenticate } from "../shopify.server";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";

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
  await authenticate.admin(request);
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
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

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const offersHref = adminEmbeddedPath("/app", search);

  return (
    <PolarisAppProvider i18n={en}>
      <AppProvider embedded apiKey={apiKey}>
        <s-app-nav>
          <s-link href={offersHref}>Offers</s-link>
        </s-app-nav>
        <Outlet />
      </AppProvider>
    </PolarisAppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
