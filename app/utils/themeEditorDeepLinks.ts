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
  /** Section id from the live theme's product.json (Product information). */
  productSectionId?: string | null;
};

/**
 * Deep link to Product template → Product information / product details → Add block → Apps.
 * Uses the live theme's product.json section when available; falls back to mainSection.
 */
export function themeAppBlockEditorUrl(
  shop: string,
  apiKey: string,
  options?: ThemeEditorLinkOptions,
): string {
  const sectionId = options?.productSectionId?.trim();
  const params = new URLSearchParams({
    template: "product",
    addAppBlockId: `${apiKey}/${THEME_APP_BLOCK_HANDLE}`,
    target: sectionId ? `sectionId:${sectionId}` : "mainSection",
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
