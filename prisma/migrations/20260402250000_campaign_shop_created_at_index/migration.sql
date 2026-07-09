-- List query: WHERE shop = ? ORDER BY createdAt DESC
CREATE INDEX IF NOT EXISTS "VolumeDiscountCampaign_shop_createdAt_idx" ON "VolumeDiscountCampaign" ("shop", "createdAt" DESC);
