type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductTemplateJson = {
  sections?: Record<string, { type?: string }>;
  order?: string[];
};

const SKIP_SECTION_TYPE_RE =
  /recommend|related|recent|complementary|instagram|newsletter|apps/i;

/**
 * Resolve the product details / product information section id from product.json.
 * Works across Dawn, Horizon, and other OS 2.0 themes with different section keys.
 */
export function productDetailsSectionIdFromTemplate(
  content: string,
): string | null {
  let parsed: ProductTemplateJson;
  try {
    parsed = JSON.parse(content) as ProductTemplateJson;
  } catch {
    return null;
  }

  const sections = parsed.sections ?? {};
  const order = parsed.order ?? Object.keys(sections);
  if (!order.length) return null;

  if (sections.main) return "main";

  for (const id of order) {
    const type = (sections[id]?.type ?? "").toLowerCase();
    if (!type || SKIP_SECTION_TYPE_RE.test(type)) continue;
    if (
      type === "main-product" ||
      type === "product" ||
      type === "product-information" ||
      type.includes("product")
    ) {
      return id;
    }
  }

  return order[0] ?? null;
}

const THEME_PRODUCT_TEMPLATE_QUERY = `#graphql
  query OffrefyProductTemplate($themeId: ID!) {
    theme(id: $themeId) {
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
`;

export async function fetchLiveThemeProductSectionId(
  admin: AdminGraphql,
  themeGid: string | null,
): Promise<string | null> {
  if (!themeGid) return null;

  try {
    const res = await admin.graphql(THEME_PRODUCT_TEMPLATE_QUERY, {
      variables: { themeId: themeGid },
    });
    const body = (await res.json()) as {
      data?: {
        theme?: {
          files?: {
            nodes?: Array<{
              body?: { content?: string | null } | null;
            } | null>;
          } | null;
        } | null;
      };
    };

    const content = body.data?.theme?.files?.nodes?.[0]?.body?.content;
    if (!content) return null;
    return productDetailsSectionIdFromTemplate(content);
  } catch (e) {
    console.warn("[Offrefy] fetchLiveThemeProductSectionId", e);
    return null;
  }
}
