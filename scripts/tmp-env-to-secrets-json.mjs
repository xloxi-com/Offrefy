import fs from "node:fs";

const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
const out = {};
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i);
  let v = t.slice(i + 1);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  out[k] = v;
}
fs.writeFileSync(".env.cf-secrets.json", JSON.stringify(out));
console.log(`Wrote ${Object.keys(out).length} keys (values omitted)`);
