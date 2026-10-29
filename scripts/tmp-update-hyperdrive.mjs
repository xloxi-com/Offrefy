import { spawnSync } from "node:child_process";
import fs from "node:fs";

const secrets = JSON.parse(fs.readFileSync(".env.cf-secrets.json", "utf8"));
const connectionString = secrets.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL missing from .env.cf-secrets.json");
  process.exit(1);
}

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
    "10",
  ],
  { encoding: "utf8", shell: true },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
