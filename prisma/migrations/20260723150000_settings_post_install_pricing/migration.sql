-- Post-install one-shot: redirect new merchants to Pricing after App Store install.
ALTER TABLE "VolumeDiscountSettings"
ADD COLUMN IF NOT EXISTS "postInstallPricingPending" BOOLEAN NOT NULL DEFAULT false;
