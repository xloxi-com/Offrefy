-- Previous "per-product" meant quantity per cart line (variant). New code uses "per-variant" for that.
UPDATE "VolumeDiscountCampaign"
SET "quantityCondition" = 'per-variant'
WHERE "quantityCondition" = 'per-product';
