import { productDetailsSectionIdFromTemplate } from "../utils/themeProductSection.server";
import { THEME_APP_BLOCK_HANDLE } from "../utils/themeEditorDeepLinks";
import { THEME_EXTENSION_UID } from "./themeAppEmbed.server";

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
        name
        files(filenames: ["templates/product.json"], first: 1) {
          nodes {
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
  mutation OffrefyUpsertProductTemplate(
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

type ProductTemplateJson = {
  sections?: Record<
    string,
    {
      type?: string;
      blocks?: Record<
        string,
        {
          type?: string;
          disabled?: boolean;
          settings?: Record<string, unknown>;
          blocks?: Record<
            string,
            {
              type?: string;
              disabled?: boolean;
              settings?: Record<string, unknown>;
            }
          >;
          block_order?: string[];
        }
      >;
      block_order?: string[];
    }
  >;
  order?: string[];
};

function isOurQuantityBreaksType(type: unknown, appHandle: string): boolean {
  if (typeof type !== "string") return false;
  const t = type.toLowerCase();
  if (!t.includes(`/blocks/${THEME_APP_BLOCK_HANDLE}/`)) return false;
  if (t.includes(THEME_EXTENSION_UID.toLowerCase())) return true;
  if (appHandle && t.includes(`/apps/${appHandle.toLowerCase()}/`)) return true;
  return t.includes("offrefy") || t.includes(THEME_APP_BLOCK_HANDLE);
}

export function buildThemeAppBlockType(appHandle: string): string {
  const handle = (appHandle || "offrefy").trim() || "offrefy";
  return `shopify://apps/${handle}/blocks/${THEME_APP_BLOCK_HANDLE}/${THEME_EXTENSION_UID}`;
}

function findBlocksContainer(section: NonNullable<ProductTemplateJson["sections"]>[string]) {
  const blocks = section?.blocks ?? {};
  for (const block of Object.values(blocks)) {
    const type = (block?.type ?? "").toLowerCase();
    if (
      type === "_product-details" ||
      type.includes("product-details") ||
      type.includes("product_details")
    ) {
      if (!block.blocks || typeof block.blocks !== "object") {
        block.blocks = {};
      }
      if (!Array.isArray(block.block_order)) {
        block.block_order = [];
      }
      return {
        blocks: block.blocks,
        blockOrder: block.block_order,
      };
    }
  }

  if (!section.blocks || typeof section.blocks !== "object") {
    section.blocks = {};
  }
  if (!Array.isArray(section.block_order)) {
    section.block_order = [];
  }
  return {
    blocks: section.blocks,
    blockOrder: section.block_order,
  };
}

function insertBeforeBuyButtons(blockOrder: string[], blockId: string): void {
  const buyIdx = blockOrder.findIndex((id) =>
    /buy[-_]?buttons?/i.test(id),
  );
  if (buyIdx >= 0) {
    blockOrder.splice(buyIdx, 0, blockId);
    return;
  }
  blockOrder.push(blockId);
}

/**
 * Add the Offrefy quantity-breaks app block to the live theme product template
 * when missing (Horizon nested blocks + Dawn-style main-product sections).
 */
export async function ensureQuantityBreaksBlockInLiveTheme(
  admin: AdminGraphql,
): Promise<{ ok: boolean; alreadyPresent: boolean; errors: string[] }> {
  try {
    const res = await admin.graphql(MAIN_THEME_PRODUCT_TEMPLATE_QUERY);
    const body = (await res.json()) as {
      data?: {
        themes?: {
          nodes?: Array<{
            id?: string;
            files?: {
              nodes?: Array<{
                body?: { content?: string | null } | null;
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
      return { ok: false, alreadyPresent: false, errors: gqlErrors };
    }

    const theme = body.data?.themes?.nodes?.[0];
    const content = theme?.files?.nodes?.[0]?.body?.content;
    const themeId = theme?.id;
    if (!themeId || !content) {
      return {
        ok: false,
        alreadyPresent: false,
        errors: ["Live theme product.json unavailable"],
      };
    }

    const appHandle =
      body.data?.currentAppInstallation?.app?.handle?.trim() || "offrefy";
    const blockType = buildThemeAppBlockType(appHandle);

    let parsed: ProductTemplateJson;
    try {
      parsed = JSON.parse(content) as ProductTemplateJson;
    } catch {
      return {
        ok: false,
        alreadyPresent: false,
        errors: ["Invalid product.json"],
      };
    }

    const sectionId = productDetailsSectionIdFromTemplate(content);
    if (!sectionId || !parsed.sections?.[sectionId]) {
      return {
        ok: false,
        alreadyPresent: false,
        errors: ["Product details section not found in product.json"],
      };
    }

    const section = parsed.sections[sectionId];
    const { blocks, blockOrder } = findBlocksContainer(section);

    for (const block of Object.values(blocks)) {
      if (isOurQuantityBreaksType(block?.type, appHandle)) {
        if (block.disabled === true) {
          block.disabled = false;
          const upsert = await admin.graphql(THEME_FILES_UPSERT, {
            variables: {
              themeId,
              files: [
                {
                  filename: "templates/product.json",
                  body: { type: "TEXT", value: JSON.stringify(parsed, null, 2) },
                },
              ],
            },
          });
          const upsertJson = (await upsert.json()) as {
            data?: {
              themeFilesUpsert?: {
                userErrors?: Array<{ message: string }>;
              };
            };
          };
          const ue = (upsertJson.data?.themeFilesUpsert?.userErrors ?? []).map(
            (e) => e.message,
          );
          if (ue.length) {
            return { ok: false, alreadyPresent: false, errors: ue };
          }
          return { ok: true, alreadyPresent: false, errors: [] };
        }
        return { ok: true, alreadyPresent: true, errors: [] };
      }
    }

    const blockId = `offrefy_quantity_breaks_${Date.now()}`;
    blocks[blockId] = {
      type: blockType,
      settings: {
        heading: "Get more, save more 🥳",
        show_section_heading: false,
        section_heading: "Offers",
      },
    };
    insertBeforeBuyButtons(blockOrder, blockId);

    const upsert = await admin.graphql(THEME_FILES_UPSERT, {
      variables: {
        themeId,
        files: [
          {
            filename: "templates/product.json",
            body: { type: "TEXT", value: JSON.stringify(parsed, null, 2) },
          },
        ],
      },
    });
    const upsertJson = (await upsert.json()) as {
      data?: {
        themeFilesUpsert?: {
          userErrors?: Array<{ message: string }>;
        };
      };
    };
    const ue = (upsertJson.data?.themeFilesUpsert?.userErrors ?? []).map(
      (e) => e.message,
    );
    if (ue.length) {
      return { ok: false, alreadyPresent: false, errors: ue };
    }

    return { ok: true, alreadyPresent: false, errors: [] };
  } catch (e) {
    return {
      ok: false,
      alreadyPresent: false,
      errors: [e instanceof Error ? e.message : "product template update failed"],
    };
  }
}
