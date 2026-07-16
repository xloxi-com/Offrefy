import { THEME_APP_EMBED_HANDLE } from "../utils/themeEditorDeepLinks";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Theme extension UID from `extensions/volume-discount-theme/shopify.extension.toml`. */
export const THEME_EXTENSION_UID = "019f469b-9c3e-742f-82ba-53cdb7f1d129";

const MAIN_THEME_SETTINGS_QUERY = `#graphql
  query OffrefyMainThemeSettings {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
        files(filenames: ["config/settings_data.json"], first: 1) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
    currentAppInstallation {
      app {
        handle
      }
    }
  }
`;

const THEME_FILES_UPSERT = `#graphql
  mutation OffrefyEnableAppEmbed(
    $themeId: ID!
    $files: [OnlineStoreThemeFilesUpsertFileInput!]!
  ) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles {
        filename
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type ThemeEmbedStatus = {
  themeId: string | null;
  themeName: string | null;
  appHandle: string | null;
  /** True only when embed is ON and points at the current extension UID. */
  enabled: boolean;
  /** True when any Offrefy embed block exists (even stale UID / disabled). */
  present: boolean;
  /** True when an Offrefy embed exists but uses an old extension UID. */
  staleUid: boolean;
  settingsRaw: string | null;
  errors: string[];
};

const embedStatusCache = new Map<
  string,
  { status: ThemeEmbedStatus; expiresAt: number }
>();
const EMBED_STATUS_TTL_MS = 2 * 60 * 1000;

export function invalidateThemeAppEmbedStatusCache(shop?: string): void {
  if (!shop) {
    embedStatusCache.clear();
    return;
  }
  embedStatusCache.delete(shop);
}

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "");
}

function isOurEmbedType(type: unknown, appHandle: string | null): boolean {
  if (typeof type !== "string") return false;
  const t = type.toLowerCase();
  if (!t.includes(`/blocks/${THEME_APP_EMBED_HANDLE}/`)) return false;
  if (t.includes(THEME_EXTENSION_UID.toLowerCase())) return true;
  if (appHandle && t.includes(`/apps/${appHandle.toLowerCase()}/`)) return true;
  // Match even if app handle slug differs slightly (e.g. Offrefy vs offrefy).
  return t.includes("offrefy") || t.includes(THEME_APP_EMBED_HANDLE);
}

function hasCurrentExtensionUid(type: unknown): boolean {
  return (
    typeof type === "string" &&
    type.toLowerCase().includes(THEME_EXTENSION_UID.toLowerCase())
  );
}

export function buildThemeAppEmbedBlockType(appHandle: string): string {
  const handle = (appHandle || "offrefy").trim() || "offrefy";
  return `shopify://apps/${handle}/blocks/${THEME_APP_EMBED_HANDLE}/${THEME_EXTENSION_UID}`;
}

type SettingsData = {
  current?: {
    blocks?: Record<
      string,
      { type?: string; disabled?: boolean; settings?: Record<string, unknown> }
    >;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function parseSettingsData(raw: string): SettingsData | null {
  try {
    return JSON.parse(stripJsonComments(raw)) as SettingsData;
  } catch {
    return null;
  }
}

async function adminJson<T>(
  admin: AdminGraphql,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: T; errors: string[] }> {
  try {
    const res = await admin.graphql(query, variables ? { variables } : undefined);
    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    return {
      data: json.data,
      errors: (json.errors ?? []).map((e) => e.message),
    };
  } catch (e) {
    if (e instanceof Response && e.status >= 300 && e.status < 400) throw e;
    const message = e instanceof Error ? e.message : "Theme GraphQL request failed";
    return { errors: [message] };
  }
}

export async function getMainThemeAppEmbedStatus(
  admin: AdminGraphql,
  shopCacheKey?: string,
): Promise<ThemeEmbedStatus> {
  if (shopCacheKey) {
    const hit = embedStatusCache.get(shopCacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.status;
    }
  }

  const status = await fetchMainThemeAppEmbedStatus(admin);
  if (shopCacheKey && status.errors.length === 0) {
    embedStatusCache.set(shopCacheKey, {
      status,
      expiresAt: Date.now() + EMBED_STATUS_TTL_MS,
    });
  }
  return status;
}

async function fetchMainThemeAppEmbedStatus(
  admin: AdminGraphql,
): Promise<ThemeEmbedStatus> {
  const { data, errors } = await adminJson<{
    themes?: {
      nodes?: Array<{
        id: string;
        name: string;
        files?: {
          nodes?: Array<{
            filename?: string;
            body?: { content?: string };
          }>;
        };
      }>;
    };
    currentAppInstallation?: { app?: { handle?: string } };
  }>(admin, MAIN_THEME_SETTINGS_QUERY);

  if (errors.length) {
    return {
      themeId: null,
      themeName: null,
      appHandle: null,
      enabled: false,
      present: false,
      staleUid: false,
      settingsRaw: null,
      errors,
    };
  }

  const theme = data?.themes?.nodes?.[0] ?? null;
  const appHandle = data?.currentAppInstallation?.app?.handle ?? null;
  const settingsRaw = theme?.files?.nodes?.[0]?.body?.content ?? null;
  if (!theme?.id || !settingsRaw) {
    return {
      themeId: theme?.id ?? null,
      themeName: theme?.name ?? null,
      appHandle,
      enabled: false,
      present: false,
      staleUid: false,
      settingsRaw,
      errors: settingsRaw ? [] : ["Could not read theme settings_data.json"],
    };
  }

  const parsed = parseSettingsData(settingsRaw);
  const blocks = parsed?.current?.blocks ?? {};
  let present = false;
  let enabled = false;
  let staleUid = false;
  for (const block of Object.values(blocks)) {
    if (!isOurEmbedType(block?.type, appHandle)) continue;
    present = true;
    const currentUid = hasCurrentExtensionUid(block?.type);
    if (!currentUid) staleUid = true;
    if (block?.disabled !== true && currentUid) {
      enabled = true;
      break;
    }
  }

  return {
    themeId: theme.id,
    themeName: theme.name,
    appHandle,
    enabled,
    present,
    staleUid,
    settingsRaw,
    errors: [],
  };
}

/**
 * Enable Offrefy app embed on the live (MAIN) theme by updating settings_data.json.
 * Requires `write_themes`. Rewrites stale extension UIDs from older deploys.
 */
export async function ensureThemeAppEmbedEnabled(
  admin: AdminGraphql,
): Promise<{ ok: boolean; alreadyEnabled: boolean; errors: string[] }> {
  const status = await getMainThemeAppEmbedStatus(admin);
  if (status.errors.length) {
    return { ok: false, alreadyEnabled: false, errors: status.errors };
  }
  if (status.enabled && !status.staleUid) {
    return { ok: true, alreadyEnabled: true, errors: [] };
  }
  if (!status.themeId || !status.settingsRaw) {
    return {
      ok: false,
      alreadyEnabled: false,
      errors: ["Live theme settings unavailable"],
    };
  }

  const appHandle = status.appHandle || "offrefy";
  const parsed = parseSettingsData(status.settingsRaw);
  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      alreadyEnabled: false,
      errors: ["Invalid settings_data.json"],
    };
  }

  if (!parsed.current || typeof parsed.current !== "object") {
    parsed.current = { blocks: {} };
  }
  if (!parsed.current.blocks || typeof parsed.current.blocks !== "object") {
    parsed.current.blocks = {};
  }

  const blocks = parsed.current.blocks;
  const blockType = buildThemeAppEmbedBlockType(appHandle);

  let updated = false;
  for (const [id, block] of Object.entries(blocks)) {
    if (!isOurEmbedType(block?.type, appHandle)) continue;
    blocks[id] = {
      ...block,
      /* Always rewrite to the current published extension UID. */
      type: blockType,
      disabled: false,
      settings: block.settings ?? {},
    };
    updated = true;
  }

  if (!updated) {
    const id = `offrefy-embed-${Date.now()}`;
    blocks[id] = {
      type: blockType,
      disabled: false,
      settings: {},
    };
  }

  const { data, errors } = await adminJson<{
    themeFilesUpsert?: {
      userErrors?: Array<{ message: string }>;
      upsertedThemeFiles?: Array<{ filename?: string }>;
    };
  }>(admin, THEME_FILES_UPSERT, {
    themeId: status.themeId,
    files: [
      {
        filename: "config/settings_data.json",
        body: { type: "TEXT", value: JSON.stringify(parsed) },
      },
    ],
  });

  const userErrors = (data?.themeFilesUpsert?.userErrors ?? []).map(
    (e) => e.message,
  );
  const allErrors = [...errors, ...userErrors];
  if (allErrors.length) {
    return { ok: false, alreadyEnabled: false, errors: allErrors };
  }

  invalidateThemeAppEmbedStatusCache();
  return { ok: true, alreadyEnabled: false, errors: [] };
}
