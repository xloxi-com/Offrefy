import {
  type CartRelevantDiscountInput,
  type CartRelevantDiscountResult,
  computeCartRelevantDiscountState,
} from "../utils/cartRelevantDiscountActivation.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const ACTIVATE = `#graphql
  mutation CartRelevantDiscountActivate($id: ID!) {
    discountAutomaticActivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DEACTIVATE = `#graphql
  mutation CartRelevantDiscountDeactivate($id: ID!) {
    discountAutomaticDeactivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function runMutation(
  admin: AdminGraphql,
  query: string,
  id: string,
  label: "activate" | "deactivate",
): Promise<string | null> {
  const res = await admin.graphql(query, { variables: { id } });
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: {
      discountAutomaticActivate?: {
        userErrors?: { message?: string }[];
      };
      discountAutomaticDeactivate?: {
        userErrors?: { message?: string }[];
      };
    };
  };
  if (json.errors?.length) {
    return `${label} ${id}: ${json.errors.map((e) => e.message).join("; ")}`;
  }
  const payload =
    label === "activate"
      ? json.data?.discountAutomaticActivate
      : json.data?.discountAutomaticDeactivate;
  const ue = payload?.userErrors ?? [];
  if (ue.length) {
    return `${label} ${id}: ${ue.map((e) => e.message || "error").join("; ")}`;
  }
  return null;
}

/**
 * Applies a {@link CartRelevantDiscountResult} via Admin API.
 * Deactivates first (free capacity toward the 25 cap), then activates.
 */
export async function applyCartRelevantDiscountStateToShopify(
  admin: AdminGraphql,
  plan: CartRelevantDiscountResult,
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  for (const id of plan.draftDiscounts) {
    const err = await runMutation(admin, DEACTIVATE, id, "deactivate");
    if (err) errors.push(err);
  }
  for (const id of plan.activeDiscounts) {
    const err = await runMutation(admin, ACTIVATE, id, "activate");
    if (err) errors.push(err);
  }

  return { errors };
}

/** Computes the activation plan and applies it to Shopify. */
export async function syncShopifyDiscountsForCart(
  admin: AdminGraphql,
  input: CartRelevantDiscountInput,
): Promise<{ plan: CartRelevantDiscountResult; errors: string[] }> {
  const plan = computeCartRelevantDiscountState(input);
  const { errors } = await applyCartRelevantDiscountStateToShopify(admin, plan);
  return { plan, errors };
}
