import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { Page, Card, Text, BlockStack, Spinner } from "@shopify/polaris";

import { login } from "../../shopify.server";
import {
  isEmbeddedAdminRequest,
  withShopFromEmbeddedHost,
} from "../../utils/embeddedShop.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = withShopFromEmbeddedHost(new URL(request.url));
  const embedded = isEmbeddedAdminRequest(url);

  if (embedded && url.toString() !== request.url) {
    throw redirect(`${url.pathname}?${url.searchParams.toString()}`);
  }

  const loginRequest = embedded
    ? new Request(url.toString(), request)
    : request;

  const errors = loginErrorMessage(await login(loginRequest));

  if (embedded) {
    return {
      errors,
      embedded: true as const,
      // eslint-disable-next-line no-undef
      apiKey: process.env.SHOPIFY_API_KEY || "",
    };
  }

  if (!url.searchParams.get("shop")) {
    throw redirect("/");
  }

  return { errors, embedded: false as const };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = withShopFromEmbeddedHost(new URL(request.url));
  const embedded = isEmbeddedAdminRequest(url);

  if (embedded && url.toString() !== request.url) {
    throw redirect(`${url.pathname}?${url.searchParams.toString()}`);
  }

  const loginRequest = embedded
    ? new Request(url.toString(), request)
    : request;

  const errors = loginErrorMessage(await login(loginRequest));
  return { errors, embedded };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors, embedded } = actionData || loaderData;

  if (embedded) {
    const apiKey =
      "apiKey" in loaderData && loaderData.apiKey ? loaderData.apiKey : "";
    return (
      <AppProvider embedded apiKey={apiKey}>
        <Page title="Connecting…">
          <Card>
            <BlockStack gap="300" inlineAlign="center">
              <Spinner accessibilityLabel="Connecting to Shopify" size="large" />
              <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                Opening Offrefy in your Shopify admin…
              </Text>
            </BlockStack>
          </Card>
        </Page>
      </AppProvider>
    );
  }

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
          <s-section heading="Log in">
            <s-text-field
              name="shop"
              label="Shop domain"
              details="example.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit">Log in</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
ss