import type { VolumeDiscountCampaignStorefrontRow } from "../utils/storefrontWidgetConfig.server";
import { volumeDiscountCampaignSyncSelect } from "../utils/volumeDiscountCampaignSelect.server";
import { prisma } from "../db.server";
import {
  buildStorefrontWidgetValue,
  stampStorefrontMaxDiscountProducts,
  stampStorefrontWidgetRev,
} from "../utils/storefrontWidgetConfig.server";
import { resolveShopifyShopPlanCap } from "../utils/cartDiscountTargetCap.server";

type StorefrontPayloadDelegate = {
  findUnique(args: {
    where: { shop: string };
    select?: { payload: true; updatedAt: true };
  }): Promise<{
    payload: string;
    updatedAt: Date;
  } | null>;
};

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** App-proxy JSON cache (see Prisma model `VolumeDiscountStorefrontPayload`). */
export async function getVolumeDiscountStorefrontPayload(shop: string) {
  const delegate = (
    prisma as unknown as { volumeDiscountStorefrontPayload: StorefrontPayloadDelegate }
  ).volumeDiscountStorefrontPayload;
  return delegate.findUnique({
    where: { shop },
    select: { payload: true, updatedAt: true },
  });
}

const EMPTY_PAYLOAD = JSON.stringify({ version: 1, campaigns: [] });

/** Background refresh when cache is older than this (ms). */
const REVALIDATE_AFTER_MS = 5 * 60 * 1000;

const revalidateInFlight = new Set<string>();

/**
 * Rebuild DB cache from active campaigns (same payload as sync). Fire-and-forget;
 * callers serve the existing cache immediately (stale-while-revalidate).
 */
export function scheduleStorefrontPayloadRevalidation(
  shop: string,
  admin: AdminGraphql,
): void {
  if (revalidateInFlight.has(shop)) return;
  revalidateInFlight.add(shop);

  void (async () => {
    try {
      const rows = await prisma.volumeDiscountCampaign.findMany({
        where: { shop, status: "active" },
        orderBy: { createdAt: "asc" },
        select: volumeDiscountCampaignSyncSelect,
      });
      const payload =
        rows.length === 0
          ? EMPTY_PAYLOAD
          : await buildStorefrontWidgetValue(rows, admin, shop);
      await prisma.volumeDiscountStorefrontPayload.upsert({
        where: { shop },
        create: { shop, payload },
        update: { payload },
      });
    } catch (e) {
      console.warn("[volume-discount] storefront payload revalidate", e);
    } finally {
      revalidateInFlight.delete(shop);
    }
  })();
}

export type StorefrontPayloadServeResult = {
  body: string;
  updatedAt: Date | null;
  /** True when cache exists but is older than REVALIDATE_AFTER_MS. */
  stale: boolean;
};

/**
 * Read cached storefront JSON for app proxy. Returns null when no row exists.
 */
export async function readStorefrontPayloadForServe(
  shop: string,
): Promise<StorefrontPayloadServeResult | null> {
  const row = await getVolumeDiscountStorefrontPayload(shop);
  if (!row?.payload) return null;
  const age = Date.now() - row.updatedAt.getTime();
  return {
    body: row.payload,
    updatedAt: row.updatedAt,
    stale: age > REVALIDATE_AFTER_MS,
  };
}

export async function upsertEmptyStorefrontPayload(shop: string): Promise<void> {
  try {
    await prisma.volumeDiscountStorefrontPayload.upsert({
      where: { shop },
      create: { shop, payload: EMPTY_PAYLOAD },
      update: { payload: EMPTY_PAYLOAD },
    });
  } catch (e) {
    console.warn("[volume-discount] clear stale storefront cache", e);
  }
}

export async function rebuildAndPersistStorefrontPayload(
  shop: string,
  rows: VolumeDiscountCampaignStorefrontRow[],
  admin: AdminGraphql,
): Promise<string> {
  const raw =
    rows.length === 0
      ? EMPTY_PAYLOAD
      : await buildStorefrontWidgetValue(rows, admin, shop);
  const planCap = await resolveShopifyShopPlanCap(admin);
  const withCap = stampStorefrontMaxDiscountProducts(raw, planCap.maxTargets);
  const payload = stampStorefrontWidgetRev(withCap, Date.now());
  await prisma.volumeDiscountStorefrontPayload.upsert({
    where: { shop },
    create: { shop, payload },
    update: { payload },
  });
  return payload;
}

export { EMPTY_PAYLOAD as STOREFRONT_EMPTY_PAYLOAD };
