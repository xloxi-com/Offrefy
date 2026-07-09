-- AlterTable
-- Index may already exist on Supabase (added outside this migration history); IF NOT EXISTS avoids errors.
CREATE INDEX IF NOT EXISTS "Session_shop_idx" ON "Session"("shop");
