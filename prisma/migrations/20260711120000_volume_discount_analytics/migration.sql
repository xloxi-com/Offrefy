-- CreateTable
CREATE TABLE "VolumeDiscountAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" TEXT,
    "eventType" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "quantity" INTEGER,
    "revenueCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolumeDiscountAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolumeDiscountAnalyticsEvent_shop_createdAt_idx" ON "VolumeDiscountAnalyticsEvent"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "VolumeDiscountAnalyticsEvent_shop_campaignId_createdAt_idx" ON "VolumeDiscountAnalyticsEvent"("shop", "campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "VolumeDiscountAnalyticsEvent_shop_eventType_createdAt_idx" ON "VolumeDiscountAnalyticsEvent"("shop", "eventType", "createdAt");
