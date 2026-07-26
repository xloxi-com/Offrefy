import { prisma } from "../db.server";

export type DiscountCombinesWith = {
  productDiscounts: boolean;
  orderDiscounts: boolean;
  shippingDiscounts: boolean;
};

export const DEFAULT_DISCOUNT_COMBINES_WITH: DiscountCombinesWith = {
  productDiscounts: true,
  orderDiscounts: false,
  shippingDiscounts: true,
};

let columnsReady: Promise<void> | null = null;

/** Add combinesWith* columns once (safe if already present). */
export function ensureDiscountCombinesWithColumns(): Promise<void> {
  if (!columnsReady) {
    columnsReady = (async () => {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "VolumeDiscountSettings"
          ADD COLUMN IF NOT EXISTS "combinesWithProductDiscounts" BOOLEAN NOT NULL DEFAULT true
        `);
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "VolumeDiscountSettings"
          ADD COLUMN IF NOT EXISTS "combinesWithOrderDiscounts" BOOLEAN NOT NULL DEFAULT false
        `);
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "VolumeDiscountSettings"
          ADD COLUMN IF NOT EXISTS "combinesWithShippingDiscounts" BOOLEAN NOT NULL DEFAULT true
        `);
      } catch (e) {
        console.warn("[volume-discount] ensure combinesWith columns", e);
      }
    })();
  }
  return columnsReady;
}

export async function readDiscountCombinesWith(
  shop: string,
): Promise<DiscountCombinesWith> {
  await ensureDiscountCombinesWithColumns();
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        combinesWithProductDiscounts: boolean;
        combinesWithOrderDiscounts: boolean;
        combinesWithShippingDiscounts: boolean;
      }>
    >`
      SELECT
        "combinesWithProductDiscounts",
        "combinesWithOrderDiscounts",
        "combinesWithShippingDiscounts"
      FROM "VolumeDiscountSettings"
      WHERE "shop" = ${shop}
      LIMIT 1
    `;
    const r = rows[0];
    if (!r) return { ...DEFAULT_DISCOUNT_COMBINES_WITH };
    return {
      productDiscounts: r.combinesWithProductDiscounts !== false,
      orderDiscounts: r.combinesWithOrderDiscounts === true,
      shippingDiscounts: r.combinesWithShippingDiscounts !== false,
    };
  } catch {
    return { ...DEFAULT_DISCOUNT_COMBINES_WITH };
  }
}

export async function persistDiscountCombinesWith(
  shop: string,
  value: DiscountCombinesWith,
): Promise<void> {
  await ensureDiscountCombinesWithColumns();
  await prisma.$executeRaw`
    INSERT INTO "VolumeDiscountSettings" (
      "shop",
      "syncInterval",
      "translationsString",
      "combinesWithProductDiscounts",
      "combinesWithOrderDiscounts",
      "combinesWithShippingDiscounts",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${shop},
      'disabled',
      '{}',
      ${value.productDiscounts},
      ${value.orderDiscounts},
      ${value.shippingDiscounts},
      NOW(),
      NOW()
    )
    ON CONFLICT ("shop") DO UPDATE
    SET
      "combinesWithProductDiscounts" = ${value.productDiscounts},
      "combinesWithOrderDiscounts" = ${value.orderDiscounts},
      "combinesWithShippingDiscounts" = ${value.shippingDiscounts},
      "updatedAt" = NOW()
  `;
}

export const SYNC_INTERVAL_OPTIONS = [
  { value: "disabled", label: "Manual only" },
  { value: "5m", label: "Every 5 minutes" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "30m", label: "Every 30 minutes" },
  { value: "1h", label: "Every hour" },
  { value: "6h", label: "Every 6 hours" },
  { value: "12h", label: "Every 12 hours" },
  { value: "24h", label: "Every 24 hours" },
] as const;

export function normalizeSyncInterval(raw: string): string {
  const v = String(raw || "").trim();
  return SYNC_INTERVAL_OPTIONS.some((o) => o.value === v) ? v : "disabled";
}
