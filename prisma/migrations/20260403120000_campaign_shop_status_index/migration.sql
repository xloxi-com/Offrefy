-- Sync + active campaign queries: WHERE shop = ? AND status = 'active'
CREATE INDEX IF NOT EXISTS "VolumeDiscountCampaign_shop_status_idx" ON "VolumeDiscountCampaign" ("shop", "status");
