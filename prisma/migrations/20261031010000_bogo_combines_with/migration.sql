-- Per-BOGO Combinations (Product / Order / Shipping discount stacking).
ALTER TABLE "BogoCampaign" ADD COLUMN IF NOT EXISTS "combinesWithProductDiscounts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BogoCampaign" ADD COLUMN IF NOT EXISTS "combinesWithOrderDiscounts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BogoCampaign" ADD COLUMN IF NOT EXISTS "combinesWithShippingDiscounts" BOOLEAN NOT NULL DEFAULT true;
