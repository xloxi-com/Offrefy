import "./env.server";
import { createRequire } from "node:module";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

/**
 * Resolve Prisma from the app root. Vite’s SSR runner can make
 * `createRequire(import.meta.url)` point at the wrong place, which loads an
 * empty client (no `volumeDiscountCampaign.findMany`).
 */
const requireFromRoot = createRequire(
  path.join(process.cwd(), "package.json"),
);
const prismaPkg = requireFromRoot("@prisma/client") as typeof import("@prisma/client");
const { PrismaClient: PrismaClientConstructor } = prismaPkg;

/** Generated client at app root — use explicit import type so IDE/tsc see all models. */
export type AppPrismaClient = PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: AppPrismaClient | undefined;
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

function createPrismaClient(): AppPrismaClient {
  /**
   * Supabase: use pooler URL on DATABASE_URL (port 6543, ?pgbouncer=true) for runtime.
   * Use DIRECT_URL (port 5432) for migrations only. Keeps serverless/worker warm paths fast.
   */
  return new PrismaClientConstructor({
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

/** Shared client — typings follow the generated client at `process.cwd()`. */
export const prisma = getPrisma();

export default prisma;
