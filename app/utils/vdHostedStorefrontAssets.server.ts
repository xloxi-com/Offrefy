import { readFileSync } from "node:fs";
import path from "node:path";

/** Keep in sync with `vd-storefront-assets.liquid` + storefront embed.version. */
const ASSET_VERSION = "1.29.5";

function assetPath(fileName: string) {
  return path.join(
    process.cwd(),
    "extensions",
    "volume-discount-theme",
    "assets",
    fileName,
  );
}

function readAsset(fileName: string): string {
  return readFileSync(assetPath(fileName), "utf8");
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

/**
 * Legacy ScriptTag bootstrap — intentionally a no-op.
 * Live widget assets come from the Theme App Embed after `shopify app deploy`.
 * Keeping this route avoids 404s for any ScriptTag not yet deleted.
 */
export function vdLoaderJsResponse(appOrigin: string) {
  const origin = (appOrigin || "https://offrey.xloxi.com").replace(/\/$/, "");
  const body = `(function(){
  var O=${JSON.stringify(origin)};
  var V=${JSON.stringify(ASSET_VERSION)};
  try { window.__xloxiAppOrigin = window.__xloxiAppOrigin || O; } catch (e) {}
  try { window.__xloxiAssetVersion = window.__xloxiAssetVersion || V; } catch (e2) {}
  /* No hosted widget inject — App Embed (theme extension) owns storefront JS. */
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
