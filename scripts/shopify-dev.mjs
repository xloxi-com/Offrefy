/**
 * Runs prisma migrate deploy (with retries) then react-router dev.
 * Used by shopify.web.toml [commands].dev
 */
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const skipMigrate =
  process.env.SHOPIFY_DEV_SKIP_DB_MIGRATE === "1" ||
  process.env.SHOPIFY_DEV_SKIP_DB_MIGRATE === "true";

async function runMigrateWithRetries(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    if (result.status === 0) return true;
    if (attempt < maxAttempts) {
      const waitSec = 3 * attempt;
      console.error(
        `\nPrisma migrate deploy failed (attempt ${attempt}/${maxAttempts}). Retrying in ${waitSec}s…\n`,
      );
      await delay(waitSec * 1000);
    }
  }
  return false;
}

async function main() {
  if (skipMigrate) {
    console.warn(
      "SHOPIFY_DEV_SKIP_DB_MIGRATE: skipping prisma migrate deploy (DB must already be migrated).\n",
    );
  } else {
    const ok = await runMigrateWithRetries(3);
    if (!ok) {
      console.error(`
Could not apply Prisma migrations (often Prisma P1001: can't reach database).

• Supabase: open the project dashboard and restore it if it is paused.
• Check .env: DATABASE_URL (pooler, often port 6543) and DIRECT_URL (direct host db.<ref>.supabase.co:5432).
• Corporate networks sometimes block outbound port 5432; try another network or VPN off.

To start the dev server without running migrations (sessions/API DB calls will fail until the DB works):
  PowerShell:  $env:SHOPIFY_DEV_SKIP_DB_MIGRATE="1"; shopify app dev
  cmd.exe:     set SHOPIFY_DEV_SKIP_DB_MIGRATE=1&& shopify app dev
`);
      process.exit(1);
    }
  }

  const dev = spawnSync("npx", ["react-router", "dev"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  process.exit(dev.status ?? 1);
}

main();
