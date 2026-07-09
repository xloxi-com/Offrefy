-- Customer tags used by logged-in tag-based customer types (Function input query variables).
ALTER TABLE "VolumeDiscountCampaign" ADD COLUMN IF NOT EXISTS "customerTags" JSONB NOT NULL DEFAULT '[]';
