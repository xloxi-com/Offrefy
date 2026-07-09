-- =============================================================================
-- Supabase → SQL Editor → New query → paste → Run
-- Keeps tables aligned with prisma/schema.prisma. Safe to re-run: IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS. Prefer `npx prisma migrate deploy` when developing;
-- use this when you bootstrap the DB only in the Supabase dashboard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Session (Shopify OAuth / session storage — Prisma Session model)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Session_shop_idx" ON "Session" ("shop");

-- -----------------------------------------------------------------------------
-- VolumeDiscountCampaign (Prisma VolumeDiscountCampaign)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "VolumeDiscountCampaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "displayName" TEXT,
    "productScope" TEXT NOT NULL,
    "quantityCondition" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "customerTags" JSONB NOT NULL DEFAULT '[]',
    "productIds" JSONB NOT NULL DEFAULT '[]',
    "collectionIds" JSONB NOT NULL DEFAULT '[]',
    "tiers" JSONB NOT NULL,
    "shopifyDiscountIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolumeDiscountCampaign_pkey" PRIMARY KEY ("id")
);

-- Older DBs created from an earlier copy of this file: add columns without errors.
ALTER TABLE "VolumeDiscountCampaign" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "VolumeDiscountCampaign" ADD COLUMN IF NOT EXISTS "customerTags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "VolumeDiscountCampaign" ADD COLUMN IF NOT EXISTS "collectionIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "VolumeDiscountCampaign" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "VolumeDiscountCampaign" ADD COLUMN IF NOT EXISTS "widgetDisplay" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "VolumeDiscountCampaign_shop_idx" ON "VolumeDiscountCampaign" ("shop");
CREATE INDEX IF NOT EXISTS "VolumeDiscountCampaign_shop_createdAt_idx" ON "VolumeDiscountCampaign" ("shop", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "VolumeDiscountCampaign_shop_status_idx" ON "VolumeDiscountCampaign" ("shop", "status");

-- -----------------------------------------------------------------------------
-- VolumeDiscountShopState (Prisma VolumeDiscountShopState)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "VolumeDiscountShopState" (
    "shop" TEXT NOT NULL,
    "functionDiscountId" TEXT NOT NULL,
    CONSTRAINT "VolumeDiscountShopState_pkey" PRIMARY KEY ("shop")
);

-- -----------------------------------------------------------------------------
-- VolumeDiscountStorefrontPayload (Prisma VolumeDiscountStorefrontPayload)
-- App proxy widget JSON cache when Admin API session is unavailable.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "VolumeDiscountStorefrontPayload" (
    "shop" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolumeDiscountStorefrontPayload_pkey" PRIMARY KEY ("shop")
);
