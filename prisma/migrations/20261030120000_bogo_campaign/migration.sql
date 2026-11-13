-- CreateTable
CREATE TABLE "BogoCampaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "buysRequirement" TEXT NOT NULL DEFAULT 'quantity',
    "buysQuantity" INTEGER,
    "buysAmount" TEXT,
    "buysScope" TEXT NOT NULL DEFAULT 'products',
    "buysProductIds" JSONB NOT NULL DEFAULT '[]',
    "buysCollectionIds" JSONB NOT NULL DEFAULT '[]',
    "getsQuantity" INTEGER NOT NULL DEFAULT 1,
    "getsScope" TEXT NOT NULL DEFAULT 'products',
    "getsProductIds" JSONB NOT NULL DEFAULT '[]',
    "getsCollectionIds" JSONB NOT NULL DEFAULT '[]',
    "getsValueType" TEXT NOT NULL DEFAULT 'free',
    "getsValue" TEXT,
    "usesPerOrderLimit" INTEGER,
    "shopifyDiscountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BogoCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BogoCampaign_shop_idx" ON "BogoCampaign"("shop");

-- CreateIndex
CREATE INDEX "BogoCampaign_shop_createdAt_idx" ON "BogoCampaign"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BogoCampaign_shop_status_idx" ON "BogoCampaign"("shop", "status");

-- CreateIndex
CREATE INDEX "BogoCampaign_shop_status_createdAt_idx" ON "BogoCampaign"("shop", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BogoCampaign_status_startsAt_idx" ON "BogoCampaign"("status", "startsAt");

-- CreateIndex
CREATE INDEX "BogoCampaign_status_endsAt_idx" ON "BogoCampaign"("status", "endsAt");
