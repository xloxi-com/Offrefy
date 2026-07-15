/**
 * Embedded apps with App Store distribution require `shop` and `host` (and related)
 * on the URL for `authenticate.admin`. Plain `<Link to="/app/...">` drops the
 * query string and triggers a redirect to the login page.
 */
export function adminEmbeddedPath(pathname: string, search: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return search ? `${path}${search}` : path;
}

/**
 * One-shot billing return params. Keeping them in the location search causes
 * nav links (which forward `search`) to re-trigger "Activated … plan" toasts.
 */
const EPHEMERAL_BILLING_KEYS = ["billing", "billing-success", "charge_id"] as const;

/** Strip billing-return query keys; optionally drop `plan` when it was a billing return. */
export function stripEphemeralBillingSearch(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return search.startsWith("?") ? "?" : "";

  const params = new URLSearchParams(raw);
  const hadBillingReturn =
    params.get("billing") === "success" ||
    params.has("billing-success") ||
    params.has("charge_id");

  for (const key of EPHEMERAL_BILLING_KEYS) {
    params.delete(key);
  }
  if (hadBillingReturn) {
    params.delete("plan");
  }

  const serialized = params.toString();
  if (!serialized) return "";
  return `?${serialized}`;
}

export function hasEphemeralBillingParams(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return false;
  const params = new URLSearchParams(raw);
  return (
    params.get("billing") === "success" ||
    params.has("billing-success") ||
    params.has("charge_id")
  );
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

/** POST target for the offers list route action; keeps OAuth params on the URL. */
export function adminEmbeddedIndexActionPath(search: string): string {
  const trimmed = search.startsWith("?") ? search.slice(1) : search;
  if (!trimmed) {
    return "/app/offers?index";
  }
  const params = new URLSearchParams(trimmed);
  if (!params.has("index")) {
    params.set("index", "");
  }
  return `/app/offers?${params.toString()}`;
}
