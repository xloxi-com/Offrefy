-- Per-product discount rules for single Function discount (unlimited products, one Shopify discount slot).

CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tiers" JSONB NOT NULL,
    "quantityCondition" TEXT NOT NULL DEFAULT 'per-variant',
    "customerType" TEXT NOT NULL DEFAULT 'everyone',
    "customerTags" JSONB NOT NULL DEFAULT '[]',
    "displayName" TEXT,
    "campaignName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscountRule_shop_campaignId_productId_key" ON "DiscountRule"("shop", "campaignId", "productId");
CREATE INDEX "DiscountRule_shop_productId_status_idx" ON "DiscountRule"("shop", "productId", "status");
CREATE INDEX "DiscountRule_shop_campaignId_idx" ON "DiscountRule"("shop", "campaignId");
