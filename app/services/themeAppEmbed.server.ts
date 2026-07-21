import { THEME_APP_EMBED_HANDLE } from "../utils/themeEditorDeepLinks";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Theme extension UID from `extensions/volume-discount-theme/shopify.extension.toml`. */
export const THEME_EXTENSION_UID = "bf69e48e-bed3-2f4e-10f1-fa992f1fd7a3642c6510";

/** Previous UIDs still present in merchant themes after redeploys. */
export const THEME_EXTENSION_UID_LEGACY = [
  THEME_EXTENSION_UID,
  "019f469b-9c3e-742f-82ba-53cdb7f1d129",
] as const;

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
              ... on OnlineStoreThemeFileBodyBase64 {
                contentBase64
              }
              ... on OnlineStoreThemeFileBodyUrl {
                url
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
  /** True when embed is ON in Theme editor (any known Offrefy embed UID). */
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

/** Sync read of warm embed status — no Shopify Admin round-trip. */
export function peekMainThemeAppEmbedStatus(
  shop: string,
): ThemeEmbedStatus | null {
  const hit = embedStatusCache.get(shop);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.status;
}

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "");
}

type ThemeFileBody = {
  content?: string | null;
  contentBase64?: string | null;
  url?: string | null;
};

function decodeThemeFileBody(body: ThemeFileBody | null | undefined): string | null {
  if (!body || typeof body !== "object") return null;
  if (typeof body.content === "string" && body.content.trim()) {
    return body.content;
  }
  if (typeof body.contentBase64 === "string" && body.contentBase64.trim()) {
    try {
      return Buffer.from(body.contentBase64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return null;
}

async function resolveThemeFileBody(
  body: ThemeFileBody | null | undefined,
): Promise<string | null> {
  const direct = decodeThemeFileBody(body);
  if (direct) return direct;
  const url = body?.url;
  if (typeof url === "string" && url.trim()) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      return text?.trim() ? text : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isOurEmbedType(type: unknown, appHandle: string | null): boolean {
  if (typeof type !== "string") return false;
  const t = type.toLowerCase().replace(/\\+/g, "");
  if (!t.includes(`/blocks/${THEME_APP_EMBED_HANDLE}`)) return false;
  for (const uid of THEME_EXTENSION_UID_LEGACY) {
    if (t.includes(uid.toLowerCase())) return true;
  }
  if (appHandle && t.includes(`/apps/${appHandle.toLowerCase()}/`)) return true;
  // Match even if app handle slug differs slightly (e.g. Offrefy vs offrefy).
  if (t.includes("offrefy") || t.includes("volume-discount")) return true;
  // Client-id style app block URI from Theme editor.
  return t.startsWith("shopify://apps/");
}

function hasCurrentExtensionUid(type: unknown): boolean {
  if (typeof type !== "string") return false;
  const t = type.toLowerCase();
  return THEME_EXTENSION_UID_LEGACY.some((uid) => t.includes(uid.toLowerCase()));
}

export function buildThemeAppEmbedBlockType(appHandle: string): string {
  const handle = (appHandle || "offrefy").trim() || "offrefy";
  return `shopify://apps/${handle}/blocks/${THEME_APP_EMBED_HANDLE}/${THEME_EXTENSION_UID}`;
}

type SettingsData = {
  current?:
    | string
    | {
        blocks?: Record<
          string,
          { type?: string; disabled?: boolean; settings?: Record<string, unknown> }
        >;
        [key: string]: unknown;
      };
  presets?: Record<
    string,
    {
      blocks?: Record<
        string,
        { type?: string; disabled?: boolean; settings?: Record<string, unknown> }
      >;
      [key: string]: unknown;
    }
  >;
  platform_customizations?: {
    blocks?: Record<
      string,
      { type?: string; disabled?: boolean; settings?: Record<string, unknown> }
    >;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function parseSettingsData(raw: string): SettingsData | null {
  const cleaned = stripJsonComments(raw);
  try {
    return JSON.parse(cleaned) as SettingsData;
  } catch {
    try {
      // Theme JSON from Admin API can include trailing commas.
      return JSON.parse(cleaned.replace(/,\s*([}\]])/g, "$1")) as SettingsData;
    } catch {
      return null;
    }
  }
}

type EmbedBlock = {
  type?: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
};

/** Resolve app-embed blocks whether `current` is an object or a preset name. */
function extractEmbedBlocks(parsed: SettingsData | null): Record<string, EmbedBlock> {
  if (!parsed || typeof parsed !== "object") return {};
  const out: Record<string, EmbedBlock> = {};

  const take = (blocks: unknown) => {
    if (!blocks || typeof blocks !== "object") return;
    for (const [id, block] of Object.entries(
      blocks as Record<string, EmbedBlock>,
    )) {
      if (block && typeof block === "object") out[id] = block;
    }
  };

  const current = parsed.current;
  if (current && typeof current === "object") {
    take((current as { blocks?: unknown }).blocks);
  } else if (typeof current === "string") {
    const presets = parsed.presets;
    if (presets && typeof presets === "object") {
      const preset = (presets as Record<string, { blocks?: unknown }>)[current];
      take(preset?.blocks);
    }
  }

  const platform = parsed.platform_customizations;
  if (platform && typeof platform === "object") {
    take((platform as { blocks?: unknown }).blocks);
  }

  return out;
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
  options?: { force?: boolean },
): Promise<ThemeEmbedStatus> {
  if (shopCacheKey && !options?.force) {
    const hit = embedStatusCache.get(shopCacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.status;
    }
  }

  const status = await fetchMainThemeAppEmbedStatus(admin);
  if (shopCacheKey && status.errors.length === 0) {
    // Shorter TTL while disabled so Setup Guide picks up Theme editor saves faster.
    const ttl = status.enabled ? EMBED_STATUS_TTL_MS : 20 * 1000;
    embedStatusCache.set(shopCacheKey, {
      status,
      expiresAt: Date.now() + ttl,
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
            body?: ThemeFileBody | null;
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
  const settingsRaw = await resolveThemeFileBody(theme?.files?.nodes?.[0]?.body);
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
  const blocks = extractEmbedBlocks(parsed);
  let present = false;
  let enabled = false;
  let staleUid = false;

  for (const block of Object.values(blocks)) {
    if (!isOurEmbedType(block?.type, appHandle)) continue;
    present = true;
    const currentUid = hasCurrentExtensionUid(block?.type);
    if (!currentUid) staleUid = true;
    // Merchant turned the embed ON in Theme editor — count as enabled even if
    // the published extension UID is from an older deploy (staleUid).
    if (block?.disabled !== true) {
      enabled = true;
      break;
    }
  }

  // Fallback when JSON shape is unexpected but the file clearly references our embed.
  if (!present || !enabled) {
    const rawLower = settingsRaw.toLowerCase().replace(/\\+/g, "");
    const handleHit =
      rawLower.includes(`/blocks/${THEME_APP_EMBED_HANDLE}`) ||
      rawLower.includes("volume-discount-embed");
    if (handleHit) {
      present = true;
      // Prefer ON unless this embed entry explicitly has disabled:true nearby.
      const explicitlyDisabled = new RegExp(
        `${THEME_APP_EMBED_HANDLE}[^\\]{]{0,200}"disabled"\\s*:\\s*true`,
        "i",
      ).test(settingsRaw.replace(/\\+/g, ""));
      if (!explicitlyDisabled) {
        enabled = true;
      }
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

  // Ensure we write into an object-shaped `current` (not a preset name string).
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
    // Apps without Shopify's themeFilesUpsert exemption always hit this —
    // return a short, actionable message (no Google Form wall of text).
    const accessDenied = allErrors.some((msg) =>
      /access denied|exemption|themeFilesUpsert/i.test(msg),
    );
    return {
      ok: false,
      alreadyEnabled: false,
      errors: accessDenied
        ? [
            "Open Theme editor → App embeds → turn on Offrefy (global) → Save.",
          ]
        : allErrors,
    };
  }

  invalidateThemeAppEmbedStatusCache();
  return { ok: true, alreadyEnabled: false, errors: [] };
}
