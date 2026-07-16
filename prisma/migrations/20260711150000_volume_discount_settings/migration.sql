-- Shop-level settings (plan, sync, widget defaults, translations).
-- Must exist before later ALTER migrations (lastSyncedAt, adminLanguage).
CREATE TABLE IF NOT EXISTS "VolumeDiscountSettings" (
    "shop" TEXT NOT NULL,
    "syncInterval" TEXT NOT NULL DEFAULT 'disabled',
    "layoutMode" TEXT NOT NULL DEFAULT 'table',
    "defaultCampaignStatus" TEXT NOT NULL DEFAULT 'active',
    "widgetPosition" TEXT NOT NULL DEFAULT 'below_cart',
    "enableCartRules" BOOLEAN NOT NULL DEFAULT true,
    "syncOnProductUpdate" BOOLEAN NOT NULL DEFAULT true,
    "translationsString" TEXT NOT NULL DEFAULT '{}',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolumeDiscountSettings_pkey" PRIMARY KEY ("shop")
);
