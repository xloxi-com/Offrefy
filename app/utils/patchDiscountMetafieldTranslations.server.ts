import { prisma } from "../db.server";
import {
  compactTranslationsForDiscountFunction,
  type DiscountFunctionCartTranslations,
} from "./storefrontTranslations";
import { loadStorefrontTranslationsForShop } from "./storefrontTranslations.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const MF_NS = "volume_discount";
const MF_KEY_CAMPAIGNS = "campaigns";

const READ_DISCOUNT_CAMPAIGNS_MF = `#graphql
  query VolumeDiscountReadCampaignsMf($id: ID!) {
    discountNode(id: $id) {
      id
      metafields(first: 50, namespace: "${MF_NS}") {
        nodes {
          key
          value
        }
      }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation VolumeDiscountPatchCampaignsMf($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function mergeStorefrontTranslationsIntoCampaignHead(
  rawValue: string,
  storefrontTranslations: DiscountFunctionCartTranslations,
): string | null {
  if (!rawValue.trim()) return null;
  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    parsed.storefrontTranslations = storefrontTranslations;
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

/**
 * Embeds cart discount badge translations on the discount function's campaigns metafield
 * so checkout/cart messages like "6% OFF (qty 20)" respect the buyer locale.
 */
export async function patchDiscountMetafieldStorefrontTranslations(
  admin: AdminGraphql,
  shop: string,
): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  const state = await prisma.volumeDiscountShopState.findUnique({
    where: { shop },
    select: { functionDiscountId: true },
  });
  if (!state?.functionDiscountId) {
    return { errors };
  }

  let storefrontTranslations: DiscountFunctionCartTranslations = {};
  try {
    const translations = await loadStorefrontTranslationsForShop(shop);
    storefrontTranslations = compactTranslationsForDiscountFunction(translations);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load translations";
    return { errors: [msg] };
  }

  let readJson: {
    errors?: Array<{ message: string }>;
    data?: {
      discountNode?: {
        id?: string;
        metafields?: { nodes?: Array<{ key: string; value: string }> };
      } | null;
    };
  };
  try {
    const readRes = await admin.graphql(READ_DISCOUNT_CAMPAIGNS_MF, {
      variables: { id: state.functionDiscountId },
    });
    readJson = (await readRes.json()) as typeof readJson;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read discount metafields";
    return { errors: [msg] };
  }

  if (readJson.errors?.length) {
    return { errors: readJson.errors.map((e) => e.message) };
  }

  const discountNode = readJson.data?.discountNode;
  const ownerId = discountNode?.id;
  const currentValue = discountNode?.metafields?.nodes?.find(
    (node) => node.key === MF_KEY_CAMPAIGNS,
  )?.value;
  if (!ownerId || !currentValue) {
    return { errors };
  }

  const nextValue = mergeStorefrontTranslationsIntoCampaignHead(
    currentValue,
    storefrontTranslations,
  );
  if (!nextValue || nextValue === currentValue) {
    return { errors };
  }

  const setRes = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId,
          namespace: MF_NS,
          key: MF_KEY_CAMPAIGNS,
          type: "json",
          value: nextValue,
        },
      ],
    },
  });
  const setJson = (await setRes.json()) as {
    errors?: Array<{ message: string }>;
    data?: {
      metafieldsSet?: {
        userErrors?: Array<{ message?: string }>;
      };
    };
  };

  if (setJson.errors?.length) {
    errors.push(...setJson.errors.map((e) => e.message));
  }
  const userErrors = setJson.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) {
    errors.push(...userErrors.map((e) => e.message ?? "metafieldsSet failed"));
  }

  return { errors };
}
