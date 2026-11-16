-- Lock the Data API. Prisma connects as the table owner, which bypasses RLS.
-- anon/authenticated have no policies, so the public Supabase API cannot read these tables.

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolumeDiscountShopState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolumeDiscountStorefrontPayload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolumeDiscountCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscountRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolumeDiscountAnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BogoCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolumeDiscountSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "Session" FROM anon, authenticated;
REVOKE ALL ON TABLE "VolumeDiscountShopState" FROM anon, authenticated;
REVOKE ALL ON TABLE "VolumeDiscountStorefrontPayload" FROM anon, authenticated;
REVOKE ALL ON TABLE "VolumeDiscountCampaign" FROM anon, authenticated;
REVOKE ALL ON TABLE "DiscountRule" FROM anon, authenticated;
REVOKE ALL ON TABLE "VolumeDiscountAnalyticsEvent" FROM anon, authenticated;
REVOKE ALL ON TABLE "BogoCampaign" FROM anon, authenticated;
REVOKE ALL ON TABLE "VolumeDiscountSettings" FROM anon, authenticated;
REVOKE ALL ON TABLE "_prisma_migrations" FROM anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
