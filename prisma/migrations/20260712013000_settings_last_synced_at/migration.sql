-- Track successful background sync attempts separately from storefront payload cache.
ALTER TABLE "VolumeDiscountSettings"
ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);

-- Backfill from existing storefront payload timestamps where available.
UPDATE "VolumeDiscountSettings" s
SET "lastSyncedAt" = p."updatedAt"
FROM "VolumeDiscountStorefrontPayload" p
WHERE p."shop" = s."shop"
  AND s."lastSyncedAt" IS NULL;
