-- AlterTable
ALTER TABLE "VolumeDiscountStorefrontPayload" ADD COLUMN IF NOT EXISTS "syncRowFingerprint" TEXT;
