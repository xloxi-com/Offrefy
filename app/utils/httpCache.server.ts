import { createHash } from "node:crypto";

const JSON_UTF8 = "application/json; charset=utf-8";

/** Weak ETag from response body — safe for JSON that may be re-serialized identically. */
export function weakEtagFromBody(body: string): string {
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

export type CachedJsonResponseOptions = {
  maxAge?: number;
  staleWhileRevalidate?: number;
  etag?: string;
  request?: Request;
  extraHeaders?: Record<string, string>;
};

/**
 * JSON response with Cache-Control + ETag. Returns 304 when If-None-Match matches.
 * Does not change payload — only transport caching.
 */
export function cachedJsonResponse(
  body: string,
  {
    maxAge = 60,
    staleWhileRevalidate = 300,
    etag,
    request,
    extraHeaders,
  }: CachedJsonResponseOptions = {},
): Response {
  const tag = etag ?? weakEtagFromBody(body);
  const swr =
    staleWhileRevalidate > 0
      ? `, stale-while-revalidate=${staleWhileRevalidate}`
      : "";
  const headers = new Headers({
    "Content-Type": JSON_UTF8,
    "Cache-Control": `private, max-age=${maxAge}${swr}`,
    ETag: tag,
    Vary: "Accept-Encoding",
    ...extraHeaders,
  });

  const ifNoneMatch = request?.headers.get("If-None-Match");
  if (ifNoneMatch && ifNoneMatch === tag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { status: 200, headers });
}
