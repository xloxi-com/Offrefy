import polarisStylesUrl from "@shopify/polaris/build/esm/styles.css?url";
import polarisButtonPressedUrl from "./styles/polaris-button-pressed.css?url";
import type { LinksFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

/**
 * Explicit stylesheet links + preload so Polaris CSS is in <head> early for SSR
 * and the browser fetches it before paint (reduces intermittent unstyled UI).
 */
export const links: LinksFunction = () => [
  {
    rel: "preconnect",
    href: "https://cdn.shopify.com",
    crossOrigin: "anonymous",
  },
  { rel: "preload", href: polarisStylesUrl, as: "style" },
  { rel: "preload", href: polarisButtonPressedUrl, as: "style" },
  { rel: "stylesheet", href: polarisStylesUrl },
  { rel: "stylesheet", href: polarisButtonPressedUrl },
  {
    rel: "stylesheet",
    href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css",
  },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Links />
        <Meta />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
