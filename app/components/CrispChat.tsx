import { useEffect } from "react";

const CRISP_WEBSITE_ID = "f0bfa571-f7f7-424a-af12-14ebf2ee3d2e";

declare global {
  interface Window {
    $crisp?: unknown[];
    CRISP_WEBSITE_ID?: string;
    CRISP_RUNTIME_CONFIG?: {
      position?: "left" | "right";
    };
  }
}

/**
 * Loads Crisp chatbox fixed at bottom-right of the Offrefy admin shell.
 */
export function CrispChat() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.getElementById("crisp-chat-loader")) return;

    window.$crisp = window.$crisp || [];
    window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
    // Explicit right-side position (default is bottom-right; reverse would move to left).
    window.CRISP_RUNTIME_CONFIG = { position: "right" };
    window.$crisp.push(["config", "position:reverse", false]);
    window.$crisp.push(["config", "container:index", 2_000_000]);

    const script = document.createElement("script");
    script.id = "crisp-chat-loader";
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // Keep the widget across SPA navigations; do not remove on unmount of layout.
    };
  }, []);

  return null;
}
