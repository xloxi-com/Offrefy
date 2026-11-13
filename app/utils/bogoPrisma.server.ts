import { prisma } from "../db.server";

/**
 * Runtime + IDE-safe BogoCampaign table accessor.
 * Uses a narrow cast so stale language-service caches that omit
 * `prisma.bogoCampaign` on AppPrismaClient still type-check.
 */
export function bogoCampaignDb() {
  return (
    prisma as unknown as {
      bogoCampaign: {
        findMany: (args?: Record<string, unknown>) => Promise<unknown[]>;
        findFirst: (args?: Record<string, unknown>) => Promise<unknown>;
        create: (args: Record<string, unknown>) => Promise<unknown>;
        update: (args: Record<string, unknown>) => Promise<unknown>;
        updateMany: (
          args: Record<string, unknown>,
        ) => Promise<{ count: number }>;
        deleteMany: (
          args: Record<string, unknown>,
        ) => Promise<{ count: number }>;
        count: (args?: Record<string, unknown>) => Promise<number>;
      };
    }
  ).bogoCampaign;
}
