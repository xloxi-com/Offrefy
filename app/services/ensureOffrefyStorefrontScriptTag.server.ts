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

const SCRIPT_TAG_CREATE = `#graphql
  mutation OffrefyScriptTagCreate($input: ScriptTagInput!) {
    scriptTagCreate(input: $input) {
      scriptTag {
        id
        src
      }
      userErrors {
        field
        message
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

const ensuredUntil = new Map<string, number>();
const ENSURE_TTL_MS = 30 * 60 * 1000;

function loaderSrc(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/vd-loader.js`;
}

/** True when this ScriptTag is one of ours (loads the Offrefy widget loader). */
function isOffrefyLoaderScriptTag(src: unknown): boolean {
  return typeof src === "string" && src.includes("/vd-loader.js");
}

/** True when ScriptTag was ensured recently (no Admin API call). */
export function isOffrefyStorefrontScriptTagRecentlyEnsured(
  shop?: string,
): boolean {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const cacheKey = shop || appUrl;
  if (!cacheKey) return false;
  return (ensuredUntil.get(cacheKey) ?? 0) > Date.now();
}

/**
 * Registers a storefront ScriptTag that loads Offrefy widget assets even when
 * Theme App Embed is disabled (common on custom / newly installed apps).
 * Requires read_script_tags + write_script_tags.
 */
export async function ensureOffrefyStorefrontScriptTag(
  admin: AdminGraphql,
  shop?: string,
): Promise<{ ok: boolean; errors: string[] }> {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) {
    return { ok: false, errors: ["Missing SHOPIFY_APP_URL"] };
  }

  const cacheKey = shop || appUrl;
  const now = Date.now();
  if ((ensuredUntil.get(cacheKey) ?? 0) > now) {
    return { ok: true, errors: [] };
  }

  const desired = loaderSrc(appUrl);

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

    /*
     * `shopify app dev` creates a loader ScriptTag pointing at the temporary
     * cloudflare/ngrok tunnel (SHOPIFY_APP_URL). After the tunnel dies the
     * storefront can no longer load the widget JS, so the widget silently
     * disappears while the discount Function (runs on Shopify) keeps working.
     * Only treat the current (desired) URL as "already ensured"; remove any
     * stale/foreign loader tags so production self-heals to the deployed URL.
     */
    const staleLoaderTags = nodes.filter(
      (n) => isOffrefyLoaderScriptTag(n.src) && n.src !== desired,
    );
    const alreadyCorrect = nodes.some((n) => n.src === desired);

    for (const stale of staleLoaderTags) {
      if (!stale.id) continue;
      try {
        await admin.graphql(SCRIPT_TAG_DELETE, {
          variables: { id: stale.id },
        });
      } catch (e) {
        if (e instanceof Response && e.status >= 300 && e.status < 400) throw e;
        console.warn(
          "[Offrefy] failed to remove stale storefront ScriptTag",
          stale.src,
          e,
        );
      }
    }

    if (alreadyCorrect) {
      ensuredUntil.set(cacheKey, now + ENSURE_TTL_MS);
      return { ok: true, errors: [] };
    }

    const createRes = await admin.graphql(SCRIPT_TAG_CREATE, {
      variables: {
        input: {
          src: desired,
          displayScope: "ONLINE_STORE",
        },
      },
    });
    const createJson = (await createRes.json()) as {
      data?: {
        scriptTagCreate?: {
          userErrors?: Array<{ message: string }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    const userErrors = (
      createJson.data?.scriptTagCreate?.userErrors ?? []
    ).map((e) => e.message);
    const gqlErrors = (createJson.errors ?? []).map((e) => e.message);
    const messages = [...gqlErrors, ...userErrors];
    const alreadyExists = messages.some((m) =>
      /already|taken|exists/i.test(m),
    );

    if (messages.length && !alreadyExists) {
      return { ok: false, errors: messages };
    }

    ensuredUntil.set(cacheKey, now + ENSURE_TTL_MS);
    return { ok: true, errors: [] };
  } catch (e) {
    if (e instanceof Response && e.status >= 300 && e.status < 400) throw e;
    return {
      ok: false,
      errors: [e instanceof Error ? e.message : "ScriptTag ensure failed"],
    };
  }
}
