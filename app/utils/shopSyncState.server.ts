import { prisma } from "../db.server";

/** Read the shop's last recorded sync time (manual or scheduled). */
export async function readShopLastSyncedAt(shop: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ lastSyncedAt: Date | null }>>`
    SELECT "lastSyncedAt"
    FROM "VolumeDiscountSettings"
    WHERE "shop" = ${shop}
    LIMIT 1
  `;
  return rows[0]?.lastSyncedAt ?? null;
}

/** Resolve the timestamp shown in Settings / setup (settings row, then payload cache). */
export async function resolveShopLastSyncedAt(shop: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ lastSyncedAt: Date | null }>>`
    SELECT COALESCE(s."lastSyncedAt", p."updatedAt") AS "lastSyncedAt"
    FROM (SELECT ${shop}::text AS shop) q
    LEFT JOIN "VolumeDiscountSettings" s ON s."shop" = q.shop
    LEFT JOIN "VolumeDiscountStorefrontPayload" p ON p."shop" = q.shop
    LIMIT 1
  `;
  return rows[0]?.lastSyncedAt ?? null;
}

/** Mark that a sync attempt completed for this shop. */
export async function touchShopLastSyncedAt(
  shop: string,
  at: Date = new Date(),
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "VolumeDiscountSettings" (
      "shop",
      "syncInterval",
      "translationsString",
      "lastSyncedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${shop},
      'disabled',
      '{}',
      ${at},
      NOW(),
      NOW()
    )
    ON CONFLICT ("shop") DO UPDATE
    SET
      "lastSyncedAt" = ${at},
      "updatedAt" = NOW()
  `;
}
