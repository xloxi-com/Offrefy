/**
 * Decode Shopify embedded `host` query param to a myshopify.com domain.
 * Example host decodes to admin.shopify.com/store/{handle}/...
 */
export function shopFromEmbeddedHost(hostParam: string): string | null {
  try {
    const normalized = hostParam.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    const match = decoded.match(/\/store\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    const handle = match[1].trim();
    if (!handle) return null;
    return handle.includes(".myshopify.com")
      ? handle
      : `${handle}.myshopify.com`;
  } catch {
    return null;
  }
}

export function isEmbeddedAdminRequest(url: URL): boolean {
  return Boolean(url.searchParams.get("host"));
}

export function withShopFromEmbeddedHost(url: URL): URL {
  const next = new URL(url.toString());
  if (!next.searchParams.get("shop") && next.searchParams.get("host")) {
    const shop = shopFromEmbeddedHost(next.searchParams.get("host")!);
    if (shop) next.searchParams.set("shop", shop);
  }
  return next;
}
