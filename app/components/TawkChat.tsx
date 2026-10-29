import { useEffect } from "react";

/** Property + widget from Tawk.to Admin → Channels → Direct Chat Link */
const TAWK_PROPERTY_ID = "6ae3a2d9bdf5f4347794f40a";
const TAWK_WIDGET_ID = "1k64j88km";
const LOADER_ID = "tawk-chat-loader";

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown> & {
      onLoad?: () => void;
    };
    Tawk_LoadStart?: Date;
  }
}

function isTawkError(event: ErrorEvent): boolean {
  const source = String(event.filename || event.message || "").toLowerCase();
  return (
    source.includes("tawk.to") ||
    source.includes("embed.tawk") ||
    source.includes("tawk")
  );
}

/**
 * Loads the Tawk.to live chat popup (bottom-right) in the Offrefy admin shell.
 * Deferred + error-guarded so a third-party race cannot crash the embedded app.
 */
export function TawkChat() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.getElementById(LOADER_ID)) return;

    const onError = (event: ErrorEvent) => {
      if (!isTawkError(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("error", onError, true);

    const boot = () => {
      try {
        window.Tawk_API = window.Tawk_API || {};
        window.Tawk_LoadStart = new Date();

        const script = document.createElement("script");
        script.id = LOADER_ID;
        script.async = true;
        script.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
        script.charset = "UTF-8";
        script.setAttribute("crossorigin", "*");

        const first = document.getElementsByTagName("script")[0];
        first?.parentNode?.insertBefore(script, first);
      } catch {
        // Never let Tawk boot crash the Shopify admin embed.
      }
    };

    // Defer until idle so first paint / App Bridge boot aren't competing with Tawk.
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(boot, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(boot, 800);
    }

    return () => {
      window.removeEventListener("error", onError, true);
      if (idleId !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
