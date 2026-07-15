import { readFileSync } from "node:fs";
import path from "node:path";

const ASSET_VERSION = "1.24.0";

function assetPath(fileName: string) {
  return path.join(
    process.cwd(),
    "extensions",
    "volume-discount-theme",
    "assets",
    fileName,
  );
}

function readAsset(fileName: string): Buffer {
  return readFileSync(assetPath(fileName));
}

export function vdStorefrontJsResponse() {
  return new Response(readAsset("volume-discount-storefront.js"), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=120, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "X-VD-Asset-Version": ASSET_VERSION,
    },
  });
}

export function vdStorefrontCssResponse() {
  return new Response(readAsset("volume-discount-storefront.css"), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=120, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "X-VD-Asset-Version": ASSET_VERSION,
    },
  });
}

/** Tiny ScriptTag bootstrap — injects CSS + main widget when App Embed is off. */
export function vdLoaderJsResponse(appOrigin: string) {
  const origin = (appOrigin || "https://offrey.xloxi.com").replace(/\/$/, "");
  const body = `(function(){
  var O=${JSON.stringify(origin)};
  var V=${JSON.stringify(ASSET_VERSION)};
  try { window.__vdAppOrigin = window.__vdAppOrigin || O; } catch (e) {}
  try { window.__vdAssetVersion = window.__vdAssetVersion || V; } catch (e2) {}
  if (!document.querySelector('link[data-vd-hosted-css="1"],link[href*="volume-discount-storefront.css"],link[href*="/vd-storefront.css"]')) {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = O + "/vd-storefront.css?v=" + encodeURIComponent(V);
    l.setAttribute("data-vd-hosted-css", "1");
    (document.head || document.documentElement).appendChild(l);
  }
  if (!document.querySelector('script[data-vd-main="1"],script[src*="volume-discount-storefront.js"],script[src*="/vd-storefront.js"]')) {
    var s = document.createElement("script");
    s.src = O + "/vd-storefront.js?v=" + encodeURIComponent(V);
    s.defer = true;
    s.setAttribute("data-vd-main", "1");
    (document.head || document.documentElement).appendChild(s);
  }
})();`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "X-VD-Asset-Version": ASSET_VERSION,
    },
  });
}
