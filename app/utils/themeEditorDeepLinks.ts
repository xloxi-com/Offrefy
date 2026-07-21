/** Liquid filenames under `extensions/volume-discount-theme/blocks/` (without `.liquid`). */
export const THEME_APP_EMBED_HANDLE = "volume-discount-embed";
export const THEME_APP_BLOCK_HANDLE = "quantity-breaks";

function themeEditorBaseUrl(shop: string, themeId?: string | null): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  const themePath = themeId?.trim() || "current";
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/${encodeURIComponent(themePath)}/editor`;
}

/**
 * Deep link to Theme settings → App embeds → Offrefy (global).
 * @see https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-embed-block-deep-linking
 */
export function themeAppEmbedEditorUrl(
  shop: string,
  apiKey: string,
  themeId?: string | null,
): string {
  const params = new URLSearchParams({
    context: "apps",
    template: "product",
    activateAppId: `${apiKey}/${THEME_APP_EMBED_HANDLE}`,
  });
  return `${themeEditorBaseUrl(shop, themeId)}?${params.toString()}`;
}

export type ThemeEditorLinkOptions = {
  themeId?: string | null;
  previewPath?: string | null;
};

/**
 * Deep link to the Product template in the theme editor.
 * Merchants add the Quantity breaks block themselves via Add block / Add section → Apps.
 * Do not use `addAppBlockId` here — that auto-inserts the block.
 */
export function themeAppBlockEditorUrl(
  shop: string,
  _apiKey: string,
  options?: ThemeEditorLinkOptions,
): string {
  const params = new URLSearchParams({
    template: "product",
  });

  const preview = options?.previewPath?.trim();
  if (preview) {
    params.set("previewPath", preview.startsWith("/") ? preview : `/${preview}`);
  }

  return `${themeEditorBaseUrl(shop, options?.themeId)}?${params.toString()}`;
}

export function mainThemeIdFromGid(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const id = gid.split("/").pop();
  return id && /^\d+$/.test(id) ? id : null;
}
