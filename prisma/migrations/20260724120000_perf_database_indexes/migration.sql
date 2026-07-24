-- Performance-only indexes (Section 1). No schema shape / business-logic changes.

-- Session: offline + non-expired listing for cron / analytics reconcile
CREATE INDEX IF NOT EXISTS "Session_isOnline_expires_shop_idx"
ON "Session"("isOnline", "expires", "shop");

-- Campaign schedule transitions (cron hot path)
CREATE INDEX IF NOT EXISTS "VolumeDiscountCampaign_status_countdownStartsAt_idx"
ON "VolumeDiscountCampaign"("status", "countdownStartsAt");

CREATE INDEX IF NOT EXISTS "VolumeDiscountCampaign_status_countdownEndsAt_idx"
ON "VolumeDiscountCampaign"("status", "countdownEndsAt");

-- Analytics order attribution (ATC / impression match by product or variant)
CREATE INDEX IF NOT EXISTS "VolumeDiscountAnalyticsEvent_shop_eventType_productId_createdAt_idx"
ON "VolumeDiscountAnalyticsEvent"("shop", "eventType", "productId", "createdAt");

CREATE INDEX IF NOT EXISTS "VolumeDiscountAnalyticsEvent_shop_eventType_variantId_createdAt_idx"
ON "VolumeDiscountAnalyticsEvent"("shop", "eventType", "variantId", "createdAt");

-- Settings: scheduled sync shop listing
CREATE INDEX IF NOT EXISTS "VolumeDiscountSettings_syncInterval_idx"
ON "VolumeDiscountSettings"("syncInterval");
