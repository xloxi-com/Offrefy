import { THEME_APP_BLOCK_HANDLE } from "../utils/themeEditorDeepLinks";
import {
  THEME_EXTENSION_UID,
  THEME_EXTENSION_UID_LEGACY,
} from "./themeAppEmbed.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const MAIN_THEME_PRODUCT_TEMPLATE_QUERY = `#graphql
  query OffrefyMainThemeProductTemplate {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        files(
          filenames: [
            "templates/product.json"
            "templates/product.context.us.json"
            "templates/product.context.international.json"
            "templates/product.context.fr.json"
            "templates/product.context.de.json"
            "templates/product.context.es.json"
            "templates/product.context.it.json"
            "templates/product.context.nl.json"
            "templates/product.context.gb.json"
            "templates/product.context.ca.json"
            "templates/product.context.au.json"
          ]
          first: 25
        ) {
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

type ThemeBlockNode = {
  type?: string;
  disabled?: boolean;
  blocks?: Record<string, ThemeBlockNode>;
};

type ProductTemplateJson = {
  sections?: Record<
    string,
    {
      type?: string;
      disabled?: boolean;
      blocks?: Record<string, ThemeBlockNode>;
    }
  >;
};

type ThemeFileBody = {
  content?: string | null;
  contentBase64?: string | null;
  url?: string | null;
};

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "");
}

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

function isOurQuantityBreaksType(type: unknown, appHandle: string): boolean {
  if (typeof type !== "string") return false;
  const t = type.toLowerCase().replace(/\\+/g, "");
  if (!t.includes("quantity-breaks") && !t.includes("quantity_breaks")) {
    return false;
  }
  // Prefer explicit app-block scheme matches.
  if (t.includes(`/blocks/${THEME_APP_BLOCK_HANDLE}`)) {
    for (const uid of THEME_EXTENSION_UID_LEGACY) {
      if (uid && t.includes(uid.toLowerCase())) return true;
    }
    if (appHandle && t.includes(`/apps/${appHandle.toLowerCase()}/`)) return true;
    if (t.includes("offrefy") || t.includes("volume-discount")) return true;
    // Client-id style: shopify://apps/<api_key>/blocks/quantity-breaks/<uid>
    if (t.startsWith("shopify://apps/")) return true;
  }
  return false;
}

function walkBlocks(
  blocks: Record<string, ThemeBlockNode> | undefined,
  visit: (block: ThemeBlockNode) => void,
): void {
  if (!blocks || typeof blocks !== "object") return;
  for (const block of Object.values(blocks)) {
    if (!block || typeof block !== "object") continue;
    visit(block);
    if (block.blocks) walkBlocks(block.blocks, visit);
  }
}

/**
 * True when any product template JSON contains an enabled Quantity breaks app block
 * (Product information → Details → Add block, or Add section → Apps).
 */
export function productJsonHasQuantityBreaksBlock(
  content: string,
  appHandle: string,
): boolean {
  const cleaned = stripJsonComments(content);

  // Fast path: raw string (handles odd nesting / parse edge cases / escaped slashes).
  const lower = cleaned.toLowerCase().replace(/\\+/g, "");
  const rawHit =
    lower.includes(`/blocks/${THEME_APP_BLOCK_HANDLE}/`) ||
    lower.includes(`/blocks/${THEME_APP_BLOCK_HANDLE}"`) ||
    lower.includes("blocks/quantity-breaks/");
  if (!rawHit) return false;

  let parsed: ProductTemplateJson;
  try {
    parsed = JSON.parse(cleaned) as ProductTemplateJson;
  } catch {
    try {
      parsed = JSON.parse(cleaned.replace(/,\s*([}\]])/g, "$1")) as ProductTemplateJson;
    } catch {
      // Content clearly references our block handle even if JSON parse fails.
      return rawHit;
    }
  }

  const sections = parsed.sections ?? {};
  for (const section of Object.values(sections)) {
    if (!section || section.disabled === true) continue;
    // App section: Add section → Apps → Quantity breaks (`target: section`).
    if (isOurQuantityBreaksType(section.type, appHandle)) {
      return true;
    }
    let found = false;
    walkBlocks(section.blocks, (block) => {
      if (
        isOurQuantityBreaksType(block.type, appHandle) &&
        block.disabled !== true
      ) {
        found = true;
      }
    });
    if (found) return true;
  }

  // Parsed but nested in an unexpected shape — trust the raw handle hit.
  return rawHit;
}

const productBlockCache = new Map<
  string,
  { present: boolean; expiresAt: number }
>();
const PRODUCT_BLOCK_TTL_MS = 20 * 1000;

export function invalidateQuantityBreaksBlockStatusCache(shop?: string): void {
  if (!shop) {
    productBlockCache.clear();
    return;
  }
  productBlockCache.delete(shop);
}

export function peekQuantityBreaksBlockInLiveTheme(
  shop: string,
): boolean | null {
  const hit = productBlockCache.get(shop);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.present;
}

export type QuantityBreaksBlockStatus = {
  present: boolean;
  checkedFiles: string[];
  errors: string[];
};

/**
 * Read-only: true when Quantity breaks is present (and not disabled) on the
 * live theme product template(s). Does not insert or modify theme files.
 */
export async function getQuantityBreaksBlockStatus(
  admin: AdminGraphql,
  shopCacheKey?: string,
  options?: { force?: boolean },
): Promise<QuantityBreaksBlockStatus> {
  if (shopCacheKey && !options?.force) {
    const hit = productBlockCache.get(shopCacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return { present: hit.present, checkedFiles: [], errors: [] };
    }
  }

  try {
    const res = await admin.graphql(MAIN_THEME_PRODUCT_TEMPLATE_QUERY);
    const body = (await res.json()) as {
      data?: {
        themes?: {
          nodes?: Array<{
            files?: {
              nodes?: Array<{
                filename?: string | null;
                body?: ThemeFileBody | null;
              } | null>;
            } | null;
          } | null>;
        } | null;
        currentAppInstallation?: { app?: { handle?: string | null } | null };
      };
      errors?: Array<{ message: string }>;
    };

    const gqlErrors = (body.errors ?? []).map((e) => e.message);
    if (gqlErrors.length) {
      console.warn("[Offrefy] getQuantityBreaksBlockStatus gql", gqlErrors);
      return { present: false, checkedFiles: [], errors: gqlErrors };
    }

    const appHandle =
      body.data?.currentAppInstallation?.app?.handle?.trim() || "offrefy";
    const fileNodes = body.data?.themes?.nodes?.[0]?.files?.nodes ?? [];
    const checkedFiles: string[] = [];
    let present = false;

    for (const node of fileNodes) {
      if (!node) continue;
      const filename = node.filename ?? "unknown";
      const content = await resolveThemeFileBody(node.body);
      if (!content) continue;
      checkedFiles.push(filename);
      if (productJsonHasQuantityBreaksBlock(content, appHandle)) {
        present = true;
        break;
      }
    }

    if (!checkedFiles.length) {
      console.warn(
        "[Offrefy] getQuantityBreaksBlockStatus: no readable product template",
      );
    }

    if (shopCacheKey) {
      productBlockCache.set(shopCacheKey, {
        present,
        expiresAt: Date.now() + PRODUCT_BLOCK_TTL_MS,
      });
    }

    return { present, checkedFiles, errors: [] };
  } catch (e) {
    const message = e instanceof Error ? e.message : "product template check failed";
    console.warn("[Offrefy] getQuantityBreaksBlockStatus", e);
    return { present: false, checkedFiles: [], errors: [message] };
  }
}

export async function isQuantityBreaksBlockInLiveTheme(
  admin: AdminGraphql,
  shopCacheKey?: string,
  options?: { force?: boolean },
): Promise<boolean> {
  const status = await getQuantityBreaksBlockStatus(
    admin,
    shopCacheKey,
    options,
  );
  return status.present;
}

export function buildThemeAppBlockType(appHandle: string): string {
  const handle = (appHandle || "offrefy").trim() || "offrefy";
  return `shopify://apps/${handle}/blocks/${THEME_APP_BLOCK_HANDLE}/${THEME_EXTENSION_UID}`;
}
