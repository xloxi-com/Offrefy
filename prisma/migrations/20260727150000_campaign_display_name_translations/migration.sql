-- Per-offer display name translations, and Shopify discount combination flags.
ALTER TABLE "VolumeDiscountCampaign" ADD COLUMN IF NOT EXISTS "displayNameTranslations" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "VolumeDiscountSettings" ADD COLUMN IF NOT EXISTS "combinesWithProductDiscounts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VolumeDiscountSettings" ADD COLUMN IF NOT EXISTS "combinesWithOrderDiscounts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VolumeDiscountSettings" ADD COLUMN IF NOT EXISTS "combinesWithShippingDiscounts" BOOLEAN NOT NULL DEFAULT true;
