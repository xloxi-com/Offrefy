import { createRequestHandler } from "react-router";

type CloudflareEnv = Record<string, unknown> & {
  CRON_SECRET?: string;
};

type CloudflareCtx = {
  waitUntil: (promise: Promise<unknown>) => void;
};

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/** Copy Worker bindings into process.env before app modules read them. */
function applyEnvToProcess(env: CloudflareEnv) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  // Fallback when secret not set yet — keeps shopifyApp() from throwing on "".
  if (!process.env.SHOPIFY_APP_URL) {
    process.env.SHOPIFY_APP_URL =
      "https://offrefy.nirojannirojan68.workers.dev";
  }
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: CloudflareCtx) {
    applyEnvToProcess(env);
    try {
      return await requestHandler(request, {
        cloudflare: { env, ctx },
      });
    } catch (error) {
      console.error("[offrefy] worker fetch failed", error);
      const message = error instanceof Error ? error.message : String(error);
      return new Response(
        `Worker error: ${message}\n\nSet Worker secrets: DATABASE_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL`,
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
  },

  async scheduled(
    _controller: unknown,
    env: CloudflareEnv,
    ctx: CloudflareCtx,
  ) {
    applyEnvToProcess(env);
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error("[offrefy] CRON_SECRET missing; skipping scheduled sync");
      return;
    }
    const request = new Request(
      "https://offrefy.nirojannirojan68.workers.dev/api/cron/scheduled-sync",
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    ctx.waitUntil(
      requestHandler(request, {
        cloudflare: { env, ctx },
      }).catch((error) => {
        console.error("[offrefy] scheduled sync failed", error);
      }),
    );
  },
};
