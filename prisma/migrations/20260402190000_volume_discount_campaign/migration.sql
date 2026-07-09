-- CreateTable
CREATE TABLE "VolumeDiscountCampaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "displayName" TEXT,
    "productScope" TEXT NOT NULL,
    "quantityCondition" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "productIds" JSONB NOT NULL DEFAULT '[]',
    "tiers" JSONB NOT NULL,
    "shopifyDiscountIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeDiscountCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolumeDiscountCampaign_shop_idx" ON "VolumeDiscountCampaign"("shop");
