import { spawnSync } from "node:child_process";
import fs from "node:fs";

const secrets = JSON.parse(fs.readFileSync(".env.cf-secrets.json", "utf8"));
const base = secrets.DATABASE_URL;
if (!base) {
  console.error("DATABASE_URL missing from .env.cf-secrets.json");
  process.exit(1);
}

// Session-mode pooler :5432 (IPv4). Transaction :6543 timed out via Hyperdrive.
const url = new URL(base);
url.port = "5432";
url.searchParams.delete("pgbouncer");
const connectionString = url.toString();

const result = spawnSync(
  "npx",
  [
    "wrangler",
    "hyperdrive",
    "update",
    "d74bcb0f876e4b4681ba76aa2b7d76bb",
    "--connection-string",
    connectionString,
    "--caching-disabled",
    "--origin-connection-limit",
    "8",
  ],
  { encoding: "utf8", shell: true },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
