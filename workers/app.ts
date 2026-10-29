import { createRequestHandler } from "react-router";

type CloudflareEnv = Record<string, unknown> & {
  CRON_SECRET?: string;
  HYPERDRIVE?: { connectionString?: string };
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
    if (typeof value !== "string") continue;
    // Always prefer Worker secrets/vars over any stale process.env from the isolate.
    process.env[key] = value;
  }
  // Hyperdrive provides a Worker-local pooled TCP path to Postgres (direct pg times out).
  if (env.HYPERDRIVE?.connectionString) {
    process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
    process.env.CF_HYPERDRIVE = "1";
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

    // Temporary DB probe (remove once Application Error is confirmed fixed).
    const probeUrl = new URL(request.url);
    if (probeUrl.pathname === "/__db_ping") {
      try {
        const { prisma } = await import("../app/db.server");
        const started = Date.now();
        const count = await prisma.session.count();
        return Response.json({
          ok: true,
          ms: Date.now() - started,
          sessionCount: count,
          hyperdrive: process.env.CF_HYPERDRIVE === "1",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[offrefy] __db_ping failed", message);
        return Response.json({ ok: false, error: message }, { status: 500 });
      }
    }

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
