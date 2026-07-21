type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const SCRIPT_TAGS_QUERY = `#graphql
  query OffrefyScriptTags {
    scriptTags(first: 50) {
      nodes {
        id
        src
        displayScope
      }
    }
  }
`;

const SCRIPT_TAG_DELETE = `#graphql
  mutation OffrefyScriptTagDelete($id: ID!) {
    scriptTagDelete(id: $id) {
      deletedScriptTagId
      userErrors {
        field
        message
      }
    }
  }
`;

const cleanedUntil = new Map<string, number>();
const CLEAN_TTL_MS = 30 * 60 * 1000;

/** True when this ScriptTag is one of ours (legacy /vd-loader.js bootstrap). */
function isOffrefyLoaderScriptTag(src: unknown): boolean {
  return typeof src === "string" && src.includes("/vd-loader.js");
}

/**
 * True when legacy ScriptTags were cleaned recently (no Admin API call).
 * Kept for callers that still check the old “script fallback ready” cache.
 */
export function isOffrefyStorefrontScriptTagRecentlyEnsured(
  shop?: string,
): boolean {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const cacheKey = shop || appUrl;
  if (!cacheKey) return false;
  return (cleanedUntil.get(cacheKey) ?? 0) > Date.now();
}

/**
 * Removes legacy Offrefy `/vd-loader.js` ScriptTags.
 *
 * Widget JS must load only from the Theme App Embed (Shopify CDN after
 * `shopify app deploy`). The old ScriptTag pointed at the hosted app URL and
 * often served a stale bundle — so local `shopify app dev` looked correct while
 * the live storefront kept old behavior.
 *
 * Requires read_script_tags + write_script_tags.
 */
export async function ensureOffrefyStorefrontScriptTag(
  admin: AdminGraphql,
  shop?: string,
): Promise<{ ok: boolean; errors: string[] }> {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const cacheKey = shop || appUrl || "default";
  const now = Date.now();
  if ((cleanedUntil.get(cacheKey) ?? 0) > now) {
    return { ok: true, errors: [] };
  }

  try {
    const listRes = await admin.graphql(SCRIPT_TAGS_QUERY);
    const listJson = (await listRes.json()) as {
      data?: {
        scriptTags?: { nodes?: Array<{ id: string; src: string }> };
      };
      errors?: Array<{ message: string }>;
    };
    if (listJson.errors?.length) {
      return { ok: false, errors: listJson.errors.map((e) => e.message) };
    }

    const nodes = listJson.data?.scriptTags?.nodes ?? [];
    const legacyLoaders = nodes.filter((n) => isOffrefyLoaderScriptTag(n.src));

    for (const tag of legacyLoaders) {
      if (!tag.id) continue;
      try {
        await admin.graphql(SCRIPT_TAG_DELETE, {
          variables: { id: tag.id },
        });
      } catch (e) {
        if (e instanceof Response && e.status >= 300 && e.status < 400) throw e;
        console.warn(
          "[Offrefy] failed to remove legacy storefront ScriptTag",
          tag.src,
          e,
        );
      }
    }

    cleanedUntil.set(cacheKey, now + CLEAN_TTL_MS);
    return { ok: true, errors: [] };
  } catch (e) {
    if (e instanceof Response && e.status >= 300 && e.status < 400) throw e;
    return {
      ok: false,
      errors: [
        e instanceof Error ? e.message : "ScriptTag cleanup failed",
      ],
    };
  }
}
