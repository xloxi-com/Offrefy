import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/^DIRECT_URL=(.+)$/m);
if (!match) {
  console.error("DIRECT_URL missing");
  process.exit(1);
}
const connectionString = match[1].trim().replace(/^["']|["']$/g, "");
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('Session', 'session', 'VolumeDiscountCampaign')
    order by table_name
  `);
  console.log("TABLES", tables.rows);
  const sessionCount = await client.query(
    `select count(*)::int as n from "Session"`,
  ).catch((e) => ({ rows: [{ error: e.message }] }));
  console.log("SESSION", sessionCount.rows[0]);
  await client.end();
} catch (error) {
  console.error("DB_FAIL", error.message);
  process.exit(1);
}
