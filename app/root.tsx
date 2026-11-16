import polarisStylesUrl from "@shopify/polaris/build/esm/styles.css?url";
import polarisButtonPressedUrl from "./styles/polaris-button-pressed.css?url";
import polarisAdminFontUrl from "./styles/polaris-admin-font.css?url";
import type { LinksFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import { POLARIS_CDN_URL } from "./components/ShopifyAppProvider";

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
  { rel: "preload", href: POLARIS_CDN_URL, as: "script" },
  { rel: "preload", href: polarisStylesUrl, as: "style" },
  { rel: "preload", href: polarisButtonPressedUrl, as: "style" },
  { rel: "stylesheet", href: polarisStylesUrl },
  { rel: "stylesheet", href: polarisButtonPressedUrl },
  { rel: "stylesheet", href: polarisAdminFontUrl },
  {
    rel: "stylesheet",
    href: "https://cdn.shopify.com/static/fonts/shopifyinter/v0/styles.css",
  },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* In the first HTML bytes. Linked Polaris CSS can arrive late, and
            an unsized SVG paints at the 300×150 default until it does. */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              ".Polaris-Icon{display:block;width:1.25rem;height:1.25rem;max-width:1.25rem;max-height:1.25rem;margin:auto;overflow:hidden}" +
              ".Polaris-Icon__Svg,.Polaris-Icon__Img,.Polaris-Icon svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%}" +
              "s-icon{display:inline-flex;width:1.25rem;height:1.25rem;max-width:1.25rem;max-height:1.25rem;overflow:hidden;vertical-align:middle;flex:0 0 1.25rem}",
          }}
        />
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
