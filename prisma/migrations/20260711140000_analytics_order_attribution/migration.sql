-- AlterTable
ALTER TABLE "VolumeDiscountAnalyticsEvent" ADD COLUMN "orderId" TEXT;

-- CreateIndex
CREATE INDEX "VolumeDiscountAnalyticsEvent_shop_orderId_idx" ON "VolumeDiscountAnalyticsEvent"("shop", "orderId");
