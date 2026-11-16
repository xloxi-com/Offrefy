import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

/**
 * Polaris App Home web-component bundle.
 * `polaris.js` is v1 forever; `polaris-2.js` is the new admin look.
 * Keep in sync with any Link preload in root.tsx.
 */
export const POLARIS_CDN_URL =
  "https://cdn.shopify.com/shopifycloud/polaris-2.js";

const APP_BRIDGE_CDN_URL =
  "https://cdn.shopify.com/shopifycloud/app-bridge.js";

type EmbeddedProps = {
  embedded: true;
  apiKey: string;
  children: ReactNode;
};

type NonEmbeddedProps = {
  embedded?: false;
  children: ReactNode;
};

export type ShopifyAppProviderProps = EmbeddedProps | NonEmbeddedProps;

/**
 * Same role as `@shopify/shopify-app-react-router` AppProvider, but loads
 * Polaris 2. Package 1.x hardcodes polaris.js (v1) with no override.
 */
export function ShopifyAppProvider(props: ShopifyAppProviderProps) {
  return (
    <>
      {props.embedded === true ? <AppBridge apiKey={props.apiKey} /> : null}
      <script src={POLARIS_CDN_URL} />
      {props.embedded === true ? (
        <ShopifyReady>{props.children}</ShopifyReady>
      ) : (
        props.children
      )}
    </>
  );
}

/**
 * `useAppBridge()` throws on the client when `window.shopify` is not set yet.
 * That crash is what the live admin was showing as the error page.
 * Wait until App Bridge has installed the global, then render the app.
 */
function ShopifyReady({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let timer = 0;
    const check = () => {
      if (window.shopify) {
        setReady(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    timer = window.setInterval(() => {
      if (check()) window.clearInterval(timer);
    }, 50);
    const stop = window.setTimeout(() => setTimedOut(true), 8000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, []);

  if (ready) return children;
  if (timedOut) {
    return (
      <s-page heading="Something went wrong" inlineSize="base">
        <s-banner heading="App Bridge did not load" tone="critical">
          Reload the page and try again.
        </s-banner>
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={() => window.location.reload()}
        >
          Reload
        </s-button>
      </s-page>
    );
  }
  return null;
}

function AppBridge({ apiKey }: { apiKey: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const href = target?.getAttribute?.("href");
      if (href) navigate(href);
    };
    document.addEventListener("shopify:navigate", handleNavigate);
    return () => {
      document.removeEventListener("shopify:navigate", handleNavigate);
    };
  }, [navigate]);

  return <script src={APP_BRIDGE_CDN_URL} data-api-key={apiKey} />;
}
