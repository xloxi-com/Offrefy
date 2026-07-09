-- Cached storefront widget JSON (app proxy reads without Admin API session).
CREATE TABLE "VolumeDiscountStorefrontPayload" (
    "shop" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeDiscountStorefrontPayload_pkey" PRIMARY KEY ("shop")
);
