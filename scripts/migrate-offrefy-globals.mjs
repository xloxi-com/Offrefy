import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsPath = path.join(
  __dirname,
  "..",
  "extensions",
  "volume-discount-theme",
  "assets",
  "volume-discount-storefront.src.js",
);
const cssPath = path.join(
  __dirname,
  "..",
  "extensions",
  "volume-discount-theme",
  "assets",
  "volume-discount-storefront.css",
);

let js = fs.readFileSync(jsPath, "utf8");

const HELPERS = `
  /** Single Offrefy namespace — never pollute window with generic globals. */
  function offrefyNs() {
    var o = window.Offrefy;
    if (!o || typeof o !== "object") {
      o = {};
      try {
        Object.defineProperty(window, "Offrefy", {
          value: o,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      } catch (e) {
        window.Offrefy = o;
      }
    }
    return o;
  }

  /** Quiet in production; prefix all logs with [Offrefy]. */
  function offrefyLog() {
    try {
      if (window.Shopify && window.Shopify.designMode) {
        var args = ["[Offrefy]"].concat([].slice.call(arguments));
        if (typeof console !== "undefined" && console.log) console.log.apply(console, args);
      }
    } catch (e) {
      void e;
    }
  }

  function offrefyWarn() {
    try {
      var args = ["[Offrefy]"].concat([].slice.call(arguments));
      if (typeof console !== "undefined" && console.warn) console.warn.apply(console, args);
    } catch (e) {
      void e;
    }
  }

  /* One-time migrate legacy __xloxi* flags from older asset snippets. */
  (function migrateLegacyOffrefyGlobals() {
    var o = offrefyNs();
    var legacy = [
      ["appEmbedActive", "__xloxiAppEmbedActive"],
      ["configRev", "__xloxiConfigRev"],
      ["appOrigin", "__xloxiAppOrigin"],
      ["assetVersion", "__xloxiAssetVersion"],
      ["configPrefetchKey", "__xloxiConfigPrefetchKey"],
      ["configPrefetch", "__xloxiConfigPrefetch"],
      ["customer", "__xloxiCustomer"],
      ["storefrontTranslations", "__xloxiStorefrontTranslations"],
      ["cartBadgeTemplates", "__xloxiCartBadgeTemplates"],
      ["storefrontLocale", "__xloxiStorefrontLocale"],
      ["maxDiscountProducts", "__xloxiMaxDiscountProducts"],
      ["storefrontAssetsLoaded", "__xloxiStorefrontAssetsLoaded"],
    ];
    for (var i = 0; i < legacy.length; i++) {
      var key = legacy[i][0];
      var old = legacy[i][1];
      try {
        if (o[key] === undefined && typeof window[old] !== "undefined") {
          o[key] = window[old];
        }
      } catch (e) {
        void e;
      }
    }
  })();

  /** Registry for Theme Editor unload / multi-instance teardown. */
  var offrefyRuntime = offrefyNs();
  if (!offrefyRuntime._teardown) offrefyRuntime._teardown = [];
  if (!offrefyRuntime._instances) offrefyRuntime._instances = new Map();

  function offrefyRegisterTeardown(fn) {
    if (typeof fn !== "function") return;
    offrefyRuntime._teardown.push(fn);
  }

  function offrefyRunTeardown() {
    var list = offrefyRuntime._teardown.splice(0, offrefyRuntime._teardown.length);
    for (var i = 0; i < list.length; i++) {
      try {
        list[i]();
      } catch (e) {
        offrefyWarn("teardown", e);
      }
    }
    try {
      document.documentElement.removeAttribute("data-offrefy-hide-theme-variant");
      document.documentElement.removeAttribute("data-offrefy-hide-theme-qty");
      document.documentElement.removeAttribute("data-offrefy-hide-theme-atc");
      document.documentElement.removeAttribute("data-offrefy-hide-theme-buy");
    } catch (e2) {
      void e2;
    }
  }
`;

if (!js.includes("function offrefyNs()")) {
  js = js.replace(
    '(function () {\n  "use strict";\n  var PROXY',
    '(function () {\n  "use strict";\n' + HELPERS + "\n  var PROXY",
  );
}

const replacements = [
  [
    /typeof window\.__xloxiConfigRev !== "undefined" && window\.__xloxiConfigRev != null\s*\?\s*String\(window\.__xloxiConfigRev\)\s*:\s*""/g,
    'offrefyNs().configRev != null ? String(offrefyNs().configRev) : ""',
  ],
  [/window\.__xloxiAppOrigin/g, "offrefyNs().appOrigin"],
  [/window\.__xloxiConfigPrefetchKey/g, "offrefyNs().configPrefetchKey"],
  [/window\.__xloxiConfigPrefetch/g, "offrefyNs().configPrefetch"],
  [/window\.__xloxiCustomer/g, "offrefyNs().customer"],
  [/window\.__xloxiStorefrontTranslations/g, "offrefyNs().storefrontTranslations"],
  [/window\.__xloxiCartBadgeTemplates/g, "offrefyNs().cartBadgeTemplates"],
  [/window\.__xloxiCartBadgePatchBound/g, "offrefyNs().cartBadgePatchBound"],
  [/window\.__xloxiStorefrontLocale/g, "offrefyNs().storefrontLocale"],
  [/window\.__xloxiLocaleWatchBound/g, "offrefyNs().localeWatchBound"],
  [/window\.__xloxiMaxDiscountProducts/g, "offrefyNs().maxDiscountProducts"],
  [/window\.__xloxiCartMutationIntercept/g, "offrefyNs().cartMutationHookBound"],
  [/window\.__xloxiAppEmbedActive/g, "offrefyNs().appEmbedActive"],
  [/window\.__xloxiAssetVersion/g, "offrefyNs().assetVersion"],
  [/window\.__xloxiConfigRev/g, "offrefyNs().configRev"],
];

for (const [re, to] of replacements) {
  js = js.replace(re, to);
}

/* Remove window.Xloxi public API pollution — keep internal version on Offrefy only. */
js = js.replace(
  /window\.Xloxi = window\.Xloxi \|\| \{\};\s*window\.Xloxi\.embed = window\.Xloxi\.embed \|\| \{\};\s*window\.Xloxi\.embed\.version = "1\.29\.5";/,
  'offrefyNs().embed = offrefyNs().embed || {};\n    offrefyNs().embed.version = "1.29.5";',
);

js = js.replace(
  /\(typeof window\.Xloxi !== "undefined" &&\s*window\.Xloxi\.messages &&\s*window\.Xloxi\.messages\.cartMaxQty\) \|\|/g,
  "(offrefyNs().messages && offrefyNs().messages.cartMaxQty) ||",
);
js = js.replace(
  /\(typeof window\.Xloxi !== "undefined" &&\s*window\.Xloxi\.messages &&\s*window\.Xloxi\.messages\.soldOut\) \|\|/g,
  "(offrefyNs().messages && offrefyNs().messages.soldOut) ||",
);

fs.writeFileSync(jsPath, js);

/* Scope remaining bare tier selectors under data-offrefy-root */
let css = fs.readFileSync(cssPath, "utf8");
css = css.replace(
  /(?<!\[data-offrefy-root\] )(?<!\[data-offrefy-root\])(?<!\.offrefy-qb )(?<!\.offrefy-volume-table )\.(offrefy-tier-[a-zA-Z0-9_-]+)/g,
  "[data-offrefy-root] .$1",
);
css = css.replace(
  /\[data-offrefy-root\] \[data-offrefy-root\]/g,
  "[data-offrefy-root]",
);
fs.writeFileSync(cssPath, css);

js = fs.readFileSync(jsPath, "utf8");
console.log("xloxi left js", (js.match(/xloxi/gi) || []).length);
console.log("remaining", [...new Set(js.match(/xloxi[\w-]*/gi) || [])]);
console.log("has offrefyNs", js.includes("function offrefyNs()"));
