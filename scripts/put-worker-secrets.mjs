import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const envText = readFileSync(".env", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[t.slice(0, i).trim()] = v;
}

function put(name, value) {
  if (!value) {
    console.log("skip empty", name);
    return false;
  }
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], {
    input: value,
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0) {
    console.error("FAIL", name, (r.stderr || r.stdout || "").slice(0, 400));
    return false;
  }
  console.log("ok", name);
  return true;
}

const cron = env.CRON_SECRET || randomBytes(24).toString("hex");

const pairs = [
  ["SHOPIFY_API_KEY", env.SHOPIFY_API_KEY],
  ["SHOPIFY_API_SECRET", env.SHOPIFY_API_SECRET],
  [
    "SHOPIFY_APP_URL",
    env.SHOPIFY_APP_URL || "https://offrefy.nirojannirojan68.workers.dev",
  ],
  ["SCOPES", env.SCOPES],
  ["DATABASE_URL", env.DATABASE_URL],
  ["CRON_SECRET", cron],
];

let failed = 0;
for (const [k, v] of pairs) {
  if (!put(k, v)) failed += 1;
}
process.exit(failed ? 1 : 0);
