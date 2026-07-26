import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const jsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "extensions",
  "volume-discount-theme",
  "assets",
  "volume-discount-storefront.src.js",
);

let s = fs.readFileSync(jsPath, "utf8");
s = s.replace(/\.offrefy-root\b/g, "[data-offrefy-root]");
s = s.replace(
  /'<div class="offrefy-bundle'/g,
  "'<div data-offrefy-widget class=\"offrefy-bundle\"",
);
fs.writeFileSync(jsPath, s);
console.log("class .offrefy-root left", (s.match(/\.offrefy-root\b/g) || []).length);
console.log("data-offrefy-widget", (s.match(/data-offrefy-widget/g) || []).length);
