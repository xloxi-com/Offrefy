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

function isOffrefyLoaderSrc(src: string): boolean {
  return (
    typeof src === "string" &&
    (src.includes("/vd-loader.js") || src.includes("offrey.xloxi.com/vd-loader"))
  );
}

/**
 * Registers a storefront ScriptTag that loads Offrefy widget assets even when
 * Theme App Embed is disabled (common on custom / newly installed apps).
 * Requires read_script_tags + write_script_tags.
 *
 * Replaces stale loaders that still point at old tunnels / Vercel hosts after
 * the app URL or distribution changes (public deploy).
 */
export async function ensureOffrefyStorefrontScriptTag(
  admin: AdminGraphql,
  shop?: string,
): Promise<{ ok: boolean; errors: string[] }> {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) {
    return { ok: false, errors: ["Missing SHOPIFY_APP_URL"] };
  }

  const desired = loaderSrc(appUrl);
  // Cache per desired host so URL migrations (public deploy) re-check immediately.
  const cacheKey = `${shop || appUrl}::${desired}`;
  const now = Date.now();
  if ((ensuredUntil.get(cacheKey) ?? 0) > now) {
    return { ok: true, errors: [] };
  }
  const errors: string[] = [];

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
    const ours = nodes.filter((n) => isOffrefyLoaderSrc(n.src));
    const hasExact = ours.some((n) => n.src === desired);
    const stale = ours.filter((n) => n.src !== desired);

    for (const tag of stale) {
      const delRes = await admin.graphql(SCRIPT_TAG_DELETE, {
        variables: { id: tag.id },
      });
      const delJson = (await delRes.json()) as {
        data?: {
          scriptTagDelete?: {
            userErrors?: Array<{ message: string }>;
          };
        };
        errors?: Array<{ message: string }>;
      };
      const delMsgs = [
        ...(delJson.errors ?? []).map((e) => e.message),
        ...(delJson.data?.scriptTagDelete?.userErrors ?? []).map(
          (e) => e.message,
        ),
      ];
      if (delMsgs.length) {
        errors.push(...delMsgs);
      }
    }

    if (hasExact) {
      if (errors.length === 0) {
        ensuredUntil.set(cacheKey, now + ENSURE_TTL_MS);
      }
      return { ok: errors.length === 0, errors };
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
      return { ok: false, errors: [...errors, ...messages] };
    }

    ensuredUntil.set(cacheKey, now + ENSURE_TTL_MS);
    return { ok: true, errors };
  } catch (e) {
    if (e instanceof Response && e.status >= 300 && e.status < 400) throw e;
    return {
      ok: false,
      errors: [e instanceof Error ? e.message : "ScriptTag ensure failed"],
    };
  }
}
