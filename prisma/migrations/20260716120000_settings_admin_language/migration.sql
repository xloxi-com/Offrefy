-- Admin UI language preference (Polaris / embedded app chrome).
-- Independent of storefront widget translationsString.
ALTER TABLE "VolumeDiscountSettings"
ADD COLUMN IF NOT EXISTS "adminLanguage" TEXT NOT NULL DEFAULT 'auto';
