import "./env.server";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

/** Generated client — typings follow `@prisma/client`. */
export type AppPrismaClient = PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: AppPrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaPoolGlobal: pg.Pool | undefined;
}

function clientHasExpectedModels(client: AppPrismaClient | undefined): boolean {
  const c = client as unknown as {
    volumeDiscountCampaign?: unknown;
    volumeDiscountShopState?: unknown;
    volumeDiscountStorefrontPayload?: unknown;
    discountRule?: unknown;
  };
  return (
    client != null &&
    typeof c.volumeDiscountCampaign !== "undefined" &&
    typeof c.volumeDiscountShopState !== "undefined" &&
    typeof c.volumeDiscountStorefrontPayload !== "undefined" &&
    typeof c.discountRule !== "undefined"
  );
}

/** Strip accidental quotes from secret/env values (wrangler .env bulk can keep them). */
function stripWrappingQuotes(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

/** Append Supabase/PgBouncer-friendly pool params for serverless when missing from DATABASE_URL. */
function runtimeDatasourceUrl(): string | undefined {
  const raw = stripWrappingQuotes(process.env.DATABASE_URL ?? "");
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("pgbouncer") && url.port === "6543") {
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("connection_limit")) {
      /* Serverless: few connections per instance avoid pooler exhaustion under cold concurrency. */
      url.searchParams.set("connection_limit", "3");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "10");
    }
    // TLS is enabled on the pg.Pool below (rejectUnauthorized: false). Do not set
    // sslmode=require here — it can force verify-full and fail on Supabase's chain.
    return url.toString();
  } catch {
    return raw;
  }
}

function needsTls(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch {
    return true;
  }
}

function createPrismaClient(): AppPrismaClient {
  /**
   * Supabase: use pooler URL on DATABASE_URL (port 6543, ?pgbouncer=true) for runtime.
   * Use DIRECT_URL (port 5432) for migrations only. Keeps serverless/worker warm paths fast.
   * `engineType = "client"` requires a driver adapter (works on Node, Vercel, and Workers).
   */
  const datasourceUrl = runtimeDatasourceUrl();
  if (!datasourceUrl) {
    throw new Error(
      "DATABASE_URL is not set. Configure it as a Worker secret / env var.",
    );
  }

  const pool =
    global.prismaPoolGlobal ??
    new pg.Pool({
      connectionString: datasourceUrl,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // Cloudflare Workers → Supabase: TLS required; pooler uses a chain Node rejects as self-signed.
      ...(needsTls(datasourceUrl)
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    });
  global.prismaPoolGlobal = pool;

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.PRISMA_LOG === "query"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}

function getPrisma(): AppPrismaClient {
  const existing = global.prismaGlobal;
  if (clientHasExpectedModels(existing)) {
    return existing!;
  }

  void existing?.$disconnect().catch(() => {});
  const client = createPrismaClient();
  global.prismaGlobal = client;
  return client;
}

/**
 * Lazy proxy — Cloudflare Workers forbid I/O / timers at module top-level.
 * Pool + PrismaClient are created on first property access inside a request.
 */
export const prisma: AppPrismaClient = new Proxy({} as AppPrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export default prisma;
