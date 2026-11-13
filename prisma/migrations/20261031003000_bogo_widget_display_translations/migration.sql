-- BOGO offer Display / Appearance / Translations (widget + locale overrides).
ALTER TABLE "BogoCampaign" ADD COLUMN IF NOT EXISTS "widgetDisplay" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "BogoCampaign" ADD COLUMN IF NOT EXISTS "displayNameTranslations" JSONB NOT NULL DEFAULT '{}';
