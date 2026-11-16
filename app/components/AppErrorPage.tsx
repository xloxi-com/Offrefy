import { ADMIN_UI_EN } from "../utils/adminUiMessages";
import { POLARIS_CDN_URL } from "./ShopifyAppProvider";

function reloadPage() {
  window.location.reload();
}

/**
 * Shown when an /app route throws. The layout's Polaris script never mounts
 * in that case, so this page loads the web-component bundle itself.
 */
export function AppErrorPage({ detail }: { detail?: string }) {
  return (
    <>
      <script src={POLARIS_CDN_URL} />
      <s-page heading={ADMIN_UI_EN["error.pageHeading"]} inlineSize="base">
        <s-banner heading={ADMIN_UI_EN["error.pageBannerHeading"]} tone="critical">
          {detail
            ? `${ADMIN_UI_EN["error.pageBody"]} ${detail}`
            : ADMIN_UI_EN["error.pageBody"]}
        </s-banner>
        <s-button slot="primary-action" variant="primary" onClick={reloadPage}>
          {ADMIN_UI_EN["common.reload"]}
        </s-button>
      </s-page>
    </>
  );
}
