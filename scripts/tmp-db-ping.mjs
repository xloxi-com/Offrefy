import pg from "pg";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres.trvnpmgiepaijryvrtth:VIv1JBdFrxFp2EKk@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

async function tryConnect(label, config) {
  const client = new pg.Client(config);
  try {
    await client.connect();
    const r = await client.query(
      `SELECT 1 AS ok, to_regclass('public."Session"') AS session_table`,
    );
    console.log(label, "OK", r.rows[0]);
    await client.end();
    return true;
  } catch (e) {
    console.log(label, "FAIL", e.message);
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

await tryConnect("no-ssl", {
  connectionString: url,
  connectionTimeoutMillis: 10000,
});
await tryConnect("ssl-false", {
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
await tryConnect("sslmode-require", {
  connectionString: url.includes("sslmode=")
    ? url
    : url + (url.includes("?") ? "&" : "?") + "sslmode=require",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
