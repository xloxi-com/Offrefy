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

function resetPrismaGlobals() {
  // Hyperdrive TCP is not safe to reuse across Worker requests via a cached Pool/client.
  const g = globalThis as typeof globalThis & {
    prismaGlobal?: unknown;
    prismaPoolGlobal?: { end?: () => Promise<unknown> };
  };
  const pool = g.prismaPoolGlobal;
  g.prismaGlobal = undefined;
  g.prismaPoolGlobal = undefined;
  void pool?.end?.().catch(() => {});
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: CloudflareCtx) {
    applyEnvToProcess(env);
    resetPrismaGlobals();

    // Temporary DB probe (remove once Application Error is confirmed fixed).
    const probeUrl = new URL(request.url);
    if (probeUrl.pathname === "/__db_ping") {
      const cs = env.HYPERDRIVE?.connectionString;
      if (!cs) {
        return Response.json(
          { ok: false, error: "HYPERDRIVE binding missing" },
          { status: 500 },
        );
      }
      const out: Record<string, unknown> = { hyperdrive: false, prisma: false };
      try {
        const { Client } = await import("pg");
        const client = new Client({ connectionString: cs });
        const started = Date.now();
        await client.connect();
        const r = await client.query(
          `SELECT 1 AS ok, to_regclass('public."Session"') AS session_table`,
        );
        await client.end();
        out.hyperdrive = true;
        out.pgMs = Date.now() - started;
        out.row = r.rows[0];
      } catch (error) {
        out.pgError = error instanceof Error ? error.message : String(error);
      }
      try {
        process.env.DATABASE_URL = cs;
        process.env.CF_HYPERDRIVE = "1";
        const { PrismaPg } = await import("@prisma/adapter-pg");
        const { PrismaClient } = await import("@prisma/client");
        const adapter = new PrismaPg({ connectionString: cs });
        const prisma = new PrismaClient({ adapter });
        const started = Date.now();
        const count = await prisma.session.count();
        await prisma.$disconnect();
        out.prisma = true;
        out.prismaMs = Date.now() - started;
        out.sessionCount = count;
      } catch (error) {
        out.prismaError =
          error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack?.split("\n").slice(0, 6) }
            : String(error);
      }
      return Response.json(out, {
        status: out.hyperdrive && out.prisma ? 200 : 500,
      });
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
