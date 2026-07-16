import { Prisma } from "@prisma/client";
import { prisma } from "../db.server";
import {
  normalizeAdminLanguage,
  type AdminLanguageCode,
} from "./adminLanguage";

/** Read persisted admin UI language; default auto (follow Shopify Admin). */
export async function resolveAdminLanguage(
  shop: string,
): Promise<AdminLanguageCode> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ adminLanguage: string | null }>
    >`
      SELECT "adminLanguage"
      FROM "VolumeDiscountSettings"
      WHERE "shop" = ${shop}
      LIMIT 1
    `;
    return normalizeAdminLanguage(rows[0]?.adminLanguage);
  } catch {
    // Column may not exist yet before migrate.
    return "auto";
  }
}

/** Persist admin UI language preference for this shop. */
export async function setAdminLanguage(
  shop: string,
  adminLanguage: AdminLanguageCode,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "VolumeDiscountSettings" (
      "shop",
      "syncInterval",
      "translationsString",
      "adminLanguage",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${shop},
      'disabled',
      '{}',
      ${adminLanguage},
      NOW(),
      NOW()
    )
    ON CONFLICT ("shop") DO UPDATE
    SET
      "adminLanguage" = ${adminLanguage},
      "updatedAt" = NOW()
  `;
}

/** Ensure the column exists (safe for deploys that lag migrate). */
export async function ensureAdminLanguageColumn(): Promise<void> {
  try {
    await prisma.$executeRaw(
      Prisma.sql`
        ALTER TABLE "VolumeDiscountSettings"
        ADD COLUMN IF NOT EXISTS "adminLanguage" TEXT NOT NULL DEFAULT 'auto'
      `,
    );
  } catch (error) {
    console.warn("[Offrefy] ensureAdminLanguageColumn", error);
  }
}
