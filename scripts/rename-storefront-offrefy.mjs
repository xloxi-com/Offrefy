import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "extensions", "volume-discount-theme");

function transformCss(css) {
  let out = css;
  out = out.replace(/--vd-/g, "--offrefy-");
  out = out.replace(/\.xloxi-/g, ".offrefy-");
  out = out.replace(/data-xloxi-/g, "data-offrefy-");
  out = out.replace(/\.ofd-/g, ".offrefy-");
  out = out.replace(/html\[data-xloxi-/g, "html[data-offrefy-");
  out = out.replace(/:has\(\.xloxi-root\)/g, ":has([data-offrefy-root])");
  out = out.replace(/:has\(\.offrefy-root\)/g, ":has([data-offrefy-root])");

  // Inherit merchant theme fonts — never override theme typography tokens.
  out = out.replace(
    /\s*\/\*\s*\n\s*\* Match the storefront body font[\s\S]*?--offrefy-font-emoji:[^;]+;\s*/g,
    "\n  /* Inherit merchant theme fonts — never override theme typography tokens. */\n  ",
  );
  out = out.replace(
    /font-family:\s*var\(--offrefy-theme-font-body\);/g,
    "font-family: inherit;",
  );
  out = out.replace(
    /font-family:\s*var\(--offrefy-theme-font-heading\),\s*var\(--offrefy-font-emoji\);/g,
    "font-family: inherit;",
  );
  out = out.replace(/\s*--offrefy-theme-font-body:[^;]+;/g, "");
  out = out.replace(/\s*--offrefy-theme-font-heading:[^;]+;/g, "");
  out = out.replace(/\s*--offrefy-font-emoji:[^;]+;/g, "");

  out = out.replace(/\.offrefy-qb\s*\{/g, "[data-offrefy-root].offrefy-qb {");
  out = out.replace(/\.offrefy-root\b/g, "[data-offrefy-root]");
  // Nested selectors that became `[data-offrefy-root] .offrefy-qb` double-root — leave as-is if rare
  return out;
}

function transformJs(js) {
  let out = js;
  out = out.replace(/--vd-/g, "--offrefy-");
  out = out.replace(/\.xloxi-/g, ".offrefy-");
  out = out.replace(/"xloxi-/g, '"offrefy-');
  out = out.replace(/'xloxi-/g, "'offrefy-");
  out = out.replace(/data-xloxi-/g, "data-offrefy-");
  out = out.replace(/xloxi-root/g, "offrefy-root");
  out = out.replace(/xloxi-qb/g, "offrefy-qb");
  out = out.replace(/ofd-tier-/g, "offrefy-tier-");
  out = out.replace(/xloxi-json-/g, "offrefy-json-");
  out = out.replace(/xloxi-atc-form-/g, "offrefy-atc-form-");
  out = out.replace(/xloxi-shopify-/g, "offrefy-shopify-");
  return out;
}

const cssPath = path.join(root, "assets", "volume-discount-storefront.css");
const jsPath = path.join(root, "assets", "volume-discount-storefront.src.js");

let js = transformJs(fs.readFileSync(jsPath, "utf8"));
/* Catch space-prefixed class fragments left in HTML string builders. */
js = js.replace(/ xloxi-/g, " offrefy-");
fs.writeFileSync(cssPath, transformCss(fs.readFileSync(cssPath, "utf8")));
fs.writeFileSync(jsPath, js);

const css = fs.readFileSync(cssPath, "utf8");
js = fs.readFileSync(jsPath, "utf8");
console.log("xloxi left css", (css.match(/xloxi/gi) || []).length);
console.log("xloxi left js", (js.match(/xloxi/gi) || []).length);
console.log("ofd- left css", (css.match(/\.ofd-/g) || []).length);
console.log("--vd- left css", (css.match(/--vd-/g) || []).length);
console.log("--vd- left js", (js.match(/--vd-/g) || []).length);
console.log("data-offrefy-root css hits", (css.match(/data-offrefy-root/g) || []).length);
if ((js.match(/xloxi/gi) || []).length) {
  console.log("remaining", [...new Set(js.match(/xloxi[\w-]*/gi) || [])]);
}
