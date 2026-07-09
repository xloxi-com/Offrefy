import type {
  TierPayload,
  VolumeDiscountProductScope,
} from "../types/volumeDiscount";

export type { TierPayload };
export type { VolumeDiscountProductScope };

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const DELETE_AUTOMATIC_MUTATION = `#graphql
  mutation DiscountAutomaticDelete($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Deletes automatic discount nodes (legacy basic discounts or the shared app discount).
 */
export async function deleteAutomaticDiscounts(
  admin: AdminGraphql,
  discountGids: string[],
): Promise<{ errors: string[] }> {
  const { graphql } = admin;
  const ids = discountGids.filter(
    (id): id is string => typeof id === "string" && Boolean(id),
  );
  const perId = await Promise.all(
    ids.map(async (id) => {
      const response = await graphql(DELETE_AUTOMATIC_MUTATION, {
        variables: { id },
      });
      const json = (await response.json()) as {
        errors?: { message: string }[];
        data?: {
          discountAutomaticDelete?: {
            deletedAutomaticDiscountId?: string | null;
            userErrors?: { message: string }[];
          };
        };
      };
      const rowErrors: string[] = [];
      if (json.errors?.length) {
        rowErrors.push(
          json.errors.map((e) => e.message).join("; ") || "GraphQL error",
        );
        return rowErrors;
      }
      const payload = json.data?.discountAutomaticDelete;
      const shopifyErrors = payload?.userErrors ?? [];
      if (shopifyErrors.length > 0) {
        rowErrors.push(
          ...shopifyErrors.map((e) => e.message || "Shopify discount error"),
        );
      }
      return rowErrors;
    }),
  );
  return { errors: perId.flat() };
}
