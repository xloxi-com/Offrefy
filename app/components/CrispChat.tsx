import { useEffect } from "react";

const CRISP_WEBSITE_ID = "f0bfa571-f7f7-424a-af12-14ebf2ee3d2e";
const LOADER_ID = "crisp-chat-loader";

declare global {
  interface Window {
    $crisp?: unknown[] | { push: (...args: unknown[]) => void };
    CRISP_WEBSITE_ID?: string;
    CRISP_RUNTIME_CONFIG?: {
      position?: "left" | "right";
    };
  }
}

function isCrispError(event: ErrorEvent): boolean {
  const message = String(event.message ?? "");
  const source = String(event.filename ?? event.error?.stack ?? "");
  return (
    source.includes("crisp.chat") ||
    source.includes("crisp") ||
    (message.includes("style") && source.includes("client_default"))
  );
}

/**
 * Loads Crisp chatbox fixed at bottom-right of the Offrefy admin shell.
 * Deferred + error-guarded so a Crisp DOM race cannot crash the embedded app.
 */
export function CrispChat() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let timer = 0;

    // Crisp sometimes throws on missing nodes inside Shopify's iframe; swallow
    // only those so the admin shell stays up.
    const onWindowError = (event: ErrorEvent) => {
      if (!isCrispError(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("error", onWindowError, true);

    const boot = () => {
      if (cancelled) return;
      if (document.getElementById(LOADER_ID)) return;
      if (!document.body || !document.head) return;

      try {
        window.$crisp = window.$crisp ?? [];
        window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
        window.CRISP_RUNTIME_CONFIG = { position: "right" };

        const queue = window.$crisp;
        if (Array.isArray(queue)) {
          queue.push(["config", "position:reverse", false]);
        } else if (queue && typeof queue.push === "function") {
          queue.push(["config", "position:reverse", false]);
        }

        const script = document.createElement("script");
        script.id = LOADER_ID;
        script.src = "https://client.crisp.chat/l.js";
        script.async = true;
        script.onerror = () => {
          script.remove();
        };
        document.head.appendChild(script);
      } catch {
        // Never let Crisp boot crash the Shopify admin embed.
      }
    };

    // Defer until idle so first paint / App Bridge boot aren't competing with Crisp.
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") {
      const idleId = ric(() => boot(), { timeout: 2500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(idleId);
        window.removeEventListener("error", onWindowError, true);
      };
    }

    timer = window.setTimeout(boot, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("error", onWindowError, true);
      // Keep the widget across SPA navigations; do not remove the script.
    };
  }, []);

  return null;
}
