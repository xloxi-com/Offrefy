/**
 * Embedded apps with App Store distribution require `shop` and `host` (and related)
 * on the URL for `authenticate.admin`. Plain `<Link to="/app/...">` drops the
 * query string and triggers a redirect to the login page.
 */
export function adminEmbeddedPath(pathname: string, search: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return search ? `${path}${search}` : path;
}

/** Same as `adminEmbeddedPath` but merges extra query keys (keeps `shop`, `host`, etc.). */
export function adminEmbeddedPathWithQuery(
  pathname: string,
  search: string,
  append: Record<string, string>,
): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  for (const [key, value] of Object.entries(append)) {
    params.set(key, value);
  }
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

/** POST target for the `app._index` route action; keeps OAuth params on the URL. */
export function adminEmbeddedIndexActionPath(search: string): string {
  const trimmed = search.startsWith("?") ? search.slice(1) : search;
  if (!trimmed) {
    return "/app?index";
  }
  const params = new URLSearchParams(trimmed);
  if (!params.has("index")) {
    params.set("index", "");
  }
  return `/app?${params.toString()}`;
}
