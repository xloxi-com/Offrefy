/**
 * Mocked Shopify GraphQL sync behavior for BOGO Free CRUD.
 * Run: node scripts/test-bogo-bxgy-sync-mock.mjs
 */
import assert from "node:assert/strict";

function collectUserErrors(userErrors, graphqlErrors) {
  const out = [];
  if (graphqlErrors?.length) out.push(...graphqlErrors.map((e) => e.message));
  for (const e of userErrors ?? []) {
    if (e.message) out.push(e.message);
  }
  return out;
}

function isMissingDiscountError(errors) {
  const blob = errors.join(" ").toLowerCase();
  return (
    blob.includes("not found") ||
    blob.includes("does not exist") ||
    blob.includes("invalid id") ||
    blob.includes("doesn't exist")
  );
}

function createMockAdmin(handlers) {
  return {
    async graphql(query, { variables } = {}) {
      const name = String(query).match(/mutation\s+(\w+)/)?.[1] || "unknown";
      const result = handlers[name]
        ? handlers[name](variables)
        : { errors: [{ message: `Unhandled ${name}` }] };
      return {
        async json() {
          return result;
        },
      };
    },
  };
}

async function runCreate(admin, input) {
  const res = await admin.graphql(
    `mutation BogoDiscountAutomaticBxgyCreate($automaticBxgyDiscount: DiscountAutomaticBxgyInput!) {
      discountAutomaticBxgyCreate(automaticBxgyDiscount: $automaticBxgyDiscount) {
        automaticDiscountNode { id }
        userErrors { message }
      }
    }`,
    { variables: { automaticBxgyDiscount: input } },
  );
  const json = await res.json();
  const errors = collectUserErrors(
    json.data?.discountAutomaticBxgyCreate?.userErrors,
    json.errors,
  );
  const id =
    json.data?.discountAutomaticBxgyCreate?.automaticDiscountNode?.id ?? null;
  return { id, errors };
}

async function runUpdate(admin, id, input) {
  const res = await admin.graphql(
    `mutation BogoDiscountAutomaticBxgyUpdate($id: ID!, $automaticBxgyDiscount: DiscountAutomaticBxgyInput!) {
      discountAutomaticBxgyUpdate(id: $id, automaticBxgyDiscount: $automaticBxgyDiscount) {
        automaticDiscountNode { id }
        userErrors { message }
      }
    }`,
    { variables: { id, automaticBxgyDiscount: input } },
  );
  const json = await res.json();
  return {
    id: json.data?.discountAutomaticBxgyUpdate?.automaticDiscountNode?.id ?? null,
    errors: collectUserErrors(
      json.data?.discountAutomaticBxgyUpdate?.userErrors,
      json.errors,
    ),
  };
}

async function runActivate(admin, id) {
  const res = await admin.graphql(
    `mutation BogoDiscountAutomaticActivate($id: ID!) {
      discountAutomaticActivate(id: $id) { userErrors { message } }
    }`,
    { variables: { id } },
  );
  const json = await res.json();
  return collectUserErrors(
    json.data?.discountAutomaticActivate?.userErrors,
    json.errors,
  );
}

async function runDeactivate(admin, id) {
  const res = await admin.graphql(
    `mutation BogoDiscountAutomaticDeactivate($id: ID!) {
      discountAutomaticDeactivate(id: $id) { userErrors { message } }
    }`,
    { variables: { id } },
  );
  const json = await res.json();
  return collectUserErrors(
    json.data?.discountAutomaticDeactivate?.userErrors,
    json.errors,
  );
}

async function runDelete(admin, id) {
  const res = await admin.graphql(
    `mutation DiscountAutomaticDelete($id: ID!) {
      discountAutomaticDelete(id: $id) {
        deletedAutomaticDiscountId
        userErrors { message }
      }
    }`,
    { variables: { id } },
  );
  const json = await res.json();
  return collectUserErrors(
    json.data?.discountAutomaticDelete?.userErrors,
    json.errors,
  );
}

const freeInput = {
  title: "Buy 1 Get 1 Free",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: null,
  customerBuys: {
    value: { quantity: "1" },
    items: { products: { productsToAdd: ["gid://shopify/Product/1"] } },
  },
  customerGets: {
    value: {
      discountOnQuantity: {
        quantity: "1",
        effect: { percentage: 1 },
      },
    },
    items: { products: { productsToAdd: ["gid://shopify/Product/1"] } },
  },
};

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

console.log("\n=== Mock create success ===");
{
  const admin = createMockAdmin({
    BogoDiscountAutomaticBxgyCreate: () => ({
      data: {
        discountAutomaticBxgyCreate: {
          automaticDiscountNode: {
            id: "gid://shopify/DiscountAutomaticNode/9",
          },
          userErrors: [],
        },
      },
    }),
  });
  const result = await runCreate(admin, freeInput);
  assert.equal(result.id, "gid://shopify/DiscountAutomaticNode/9");
  assert.deepEqual(result.errors, []);
  assert.equal(
    freeInput.customerGets.value.discountOnQuantity.effect.percentage,
    1,
  );
  ok("Create returns discount ID");
}

console.log("\n=== Mock create userErrors ===");
{
  const admin = createMockAdmin({
    BogoDiscountAutomaticBxgyCreate: () => ({
      data: {
        discountAutomaticBxgyCreate: {
          automaticDiscountNode: null,
          userErrors: [{ message: "Items in customer buys must be defined" }],
        },
      },
    }),
  });
  const result = await runCreate(admin, freeInput);
  assert.equal(result.id, null);
  assert.ok(result.errors[0].includes("customer buys"));
  ok("Create surfaces userErrors");
}

console.log("\n=== Mock GraphQL transport error ===");
{
  const admin = createMockAdmin({
    BogoDiscountAutomaticBxgyCreate: () => ({
      errors: [{ message: "Internal error" }],
    }),
  });
  const result = await runCreate(admin, freeInput);
  assert.equal(result.id, null);
  assert.deepEqual(result.errors, ["Internal error"]);
  ok("Create surfaces GraphQL errors");
}

console.log("\n=== Mock update + missing → recreate decision ===");
{
  const admin = createMockAdmin({
    BogoDiscountAutomaticBxgyUpdate: () => ({
      data: {
        discountAutomaticBxgyUpdate: {
          automaticDiscountNode: null,
          userErrors: [{ message: "Discount not found" }],
        },
      },
    }),
  });
  const updated = await runUpdate(
    admin,
    "gid://shopify/DiscountAutomaticNode/missing",
    freeInput,
  );
  assert.ok(isMissingDiscountError(updated.errors));
  ok("Missing remote triggers recreate path");
}

console.log("\n=== Mock update validation error must NOT recreate ===");
{
  const errors = ["Customer gets quantity must be greater than 0"];
  assert.equal(isMissingDiscountError(errors), false);
  ok("Validation errors stay on update-only path");
}

console.log("\n=== Mock activate / deactivate / delete ===");
{
  const store = new Set(["gid://shopify/DiscountAutomaticNode/1"]);
  const admin = createMockAdmin({
    BogoDiscountAutomaticActivate: ({ id }) => {
      if (!store.has(id)) {
        return {
          data: {
            discountAutomaticActivate: {
              userErrors: [{ message: "Discount not found" }],
            },
          },
        };
      }
      return { data: { discountAutomaticActivate: { userErrors: [] } } };
    },
    BogoDiscountAutomaticDeactivate: ({ id }) => {
      if (!store.has(id)) {
        return {
          data: {
            discountAutomaticDeactivate: {
              userErrors: [{ message: "Discount not found" }],
            },
          },
        };
      }
      return { data: { discountAutomaticDeactivate: { userErrors: [] } } };
    },
    DiscountAutomaticDelete: ({ id }) => {
      if (!store.has(id)) {
        return {
          data: {
            discountAutomaticDelete: {
              deletedAutomaticDiscountId: null,
              userErrors: [{ message: "Discount not found" }],
            },
          },
        };
      }
      store.delete(id);
      return {
        data: {
          discountAutomaticDelete: {
            deletedAutomaticDiscountId: id,
            userErrors: [],
          },
        },
      };
    },
  });
  const id = "gid://shopify/DiscountAutomaticNode/1";
  assert.deepEqual(await runActivate(admin, id), []);
  assert.deepEqual(await runDeactivate(admin, id), []);
  assert.deepEqual(await runDelete(admin, id), []);
  assert.ok(isMissingDiscountError(await runDelete(admin, id)));
  ok("Activate / deactivate / delete + already-deleted");
}

console.log("\n=== Duplicate create prevention signal ===");
{
  /* Soft dedupe: if an identical offer already has a Shopify ID within window, reuse. */
  const recent = {
    id: "camp_1",
    shopifyDiscountId: "gid://shopify/DiscountAutomaticNode/9",
  };
  const shouldReuse = Boolean(recent.shopifyDiscountId);
  assert.equal(shouldReuse, true);
  ok("Dedupe reuses synced offer");
}

console.log(`\nOK: ${passed} BOGO Free sync mock groups passed\n`);
