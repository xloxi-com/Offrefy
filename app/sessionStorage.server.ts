import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import type { Session } from "@shopify/shopify-api";
import { prisma } from "./db.server";

/**
 * Shopify's PrismaSessionStorage polls the Session table once in its constructor
 * and then caches that promise on the Worker isolate. A single Hyperdrive timeout
 * rejects it forever, and every later admin load throws
 * "Prisma session table does not exist" → Application Error.
 * This wrapper drops that poisoned instance and tries once more.
 */
type InnerStorage = ReturnType<typeof createInner>;

let inner: InnerStorage | null = null;

function createInner() {
  return new PrismaSessionStorage(prisma, {
    connectionRetries: 2,
    connectionRetryIntervalMs: 200,
  });
}

function shouldReset(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist") ||
    message.includes("not ready") ||
    message.includes("does not have a") ||
    message.includes("timeout exceeded") ||
    message.includes("EMAXCONN") ||
    message.includes("ECONN") ||
    message.includes("Connection terminated") ||
    message.includes("Can't reach database") ||
    message.includes("Server has closed the connection") ||
    message.includes("remaining connection slots")
  );
}

async function withStorage<T>(
  run: (storage: InnerStorage) => Promise<T>,
): Promise<T> {
  if (!inner) inner = createInner();
  try {
    return await run(inner);
  } catch (error) {
    if (!shouldReset(error)) throw error;
    console.warn("[Offrefy] session storage reset after connection failure");
    inner = null;
    const fresh = createInner();
    inner = fresh;
    try {
      return await run(fresh);
    } catch (retryError) {
      inner = null;
      throw retryError;
    }
  }
}

export const resilientPrismaSessionStorage = {
  storeSession(session: Session) {
    return withStorage((storage) => storage.storeSession(session));
  },
  loadSession(id: string) {
    return withStorage((storage) => storage.loadSession(id));
  },
  deleteSession(id: string) {
    return withStorage((storage) => storage.deleteSession(id));
  },
  deleteSessions(ids: string[]) {
    return withStorage((storage) => storage.deleteSessions(ids));
  },
  findSessionsByShop(shop: string) {
    return withStorage((storage) => storage.findSessionsByShop(shop));
  },
};
