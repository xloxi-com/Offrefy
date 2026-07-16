/**
 * Merge analytics.* / offers.* / common.* packs into admin locale JSON files.
 * Source keys: scripts/i18n-keys.json
 * Packs: scripts/admin-i18n-packs/*.json
 *
 * Usage: node scripts/merge-admin-analytics-offers-i18n.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDir = path.join(root, "app", "locales", "admin");
const packsDir = path.join(root, "scripts", "admin-i18n-packs");
const keysPath = path.join(root, "scripts", "i18n-keys.json");

const expectedKeys = Object.keys(JSON.parse(fs.readFileSync(keysPath, "utf8")));

/** Locales that get a dedicated pack (pt.json copies pt-PT). */
const packLocales = [
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "pt-PT",
  "pt-BR",
  "pl",
  "cs",
  "sv",
  "da",
  "fi",
  "nb",
  "tr",
  "ja",
  "ko",
  "th",
  "vi",
  "zh-CN",
  "zh-TW",
];

function loadPack(locale) {
  const file = path.join(packsDir, `${locale}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing pack: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assertPackComplete(locale, pack) {
  const missing = expectedKeys.filter((k) => !(k in pack));
  const extra = Object.keys(pack).filter((k) => !expectedKeys.includes(k));
  if (missing.length) {
    throw new Error(
      `${locale} pack missing ${missing.length} keys: ${missing.slice(0, 8).join(", ")}…`,
    );
  }
  if (extra.length) {
    console.warn(`${locale} pack has ${extra.length} unexpected keys (ignored)`);
  }
  // Preserve placeholders from English source where pack value dropped a {var}
  const en = JSON.parse(fs.readFileSync(keysPath, "utf8"));
  for (const key of expectedKeys) {
    const enVal = en[key];
    const vars = [...enVal.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]);
    for (const v of vars) {
      if (!pack[key].includes(v)) {
        throw new Error(`${locale}.${key} missing placeholder ${v}`);
      }
    }
  }
}

function mergeLocale(localeFile, pack) {
  const file = path.join(adminDir, localeFile);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(data, pack);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function verifyLocale(localeFile) {
  const data = JSON.parse(
    fs.readFileSync(path.join(adminDir, localeFile), "utf8"),
  );
  const missing = expectedKeys.filter((k) => !(k in data));
  return missing;
}

let failed = false;

for (const locale of packLocales) {
  const pack = loadPack(locale);
  assertPackComplete(locale, pack);
  mergeLocale(`${locale}.json`, pack);
  console.log(`merged ${locale}.json (${Object.keys(pack).length} keys)`);
}

// pt.json mirrors pt-PT
const ptPack = loadPack("pt-PT");
mergeLocale("pt.json", ptPack);
console.log(`merged pt.json (same as pt-PT, ${Object.keys(ptPack).length} keys)`);

console.log("\n--- verification ---");
const localesToCheck = [
  ...packLocales.map((l) => `${l}.json`),
  "pt.json",
];

for (const file of localesToCheck) {
  const missing = verifyLocale(file);
  if (missing.length) {
    failed = true;
    console.error(`FAIL ${file}: ${missing.length} missing`);
  } else {
    console.log(`OK ${file}: 0 missing / ${expectedKeys.length} keys`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`\nAll ${localesToCheck.length} locales have all ${expectedKeys.length} keys.`);
