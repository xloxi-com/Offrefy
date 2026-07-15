import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "./db.server";
import { ensureOffrefyAnalyticsPixel } from "./services/ensureOffrefyAnalyticsPixel.server";
import { SHOPIFY_APP_SCOPES } from "./shopifyAppScopes";
import { BILLING_PLAN, billingAmountDollars } from "./utils/billingPlans";

function resolveAppScopes(): string[] {
  const fromEnv = (process.env.SCOPES ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : [...SHOPIFY_APP_SCOPES];
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: resolveAppScopes(),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  // Hoisted @shopify/shopify-api vs nested copy under shopify-app-react-router — types differ; runtime is fine.
  // @ts-expect-error SessionStorage / Session mismatch from duplicate shopify-api installations
  sessionStorage: new PrismaSessionStorage(prisma, {
    // Serverless cold starts + PgBouncer: fail fast between retries instead of 5s×2.
    connectionRetries: 5,
    connectionRetryIntervalMs: 500,
  }),
  distribution: AppDistribution.AppStore,
  billing: {
    [BILLING_PLAN.standardMonthly]: {
      lineItems: [
        {
          amount: billingAmountDollars("standard", "monthly"),
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [BILLING_PLAN.standardYearly]: {
      lineItems: [
        {
          amount: billingAmountDollars("standard", "yearly"),
          currencyCode: "USD",
          interval: BillingInterval.Annual,
        },
      ],
    },
    [BILLING_PLAN.premiumMonthly]: {
      lineItems: [
        {
          amount: billingAmountDollars("premium", "monthly"),
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [BILLING_PLAN.premiumYearly]: {
      lineItems: [
        {
          amount: billingAmountDollars("premium", "yearly"),
          currencyCode: "USD",
          interval: BillingInterval.Annual,
        },
      ],
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      await shopify.registerWebhooks({ session });
      await ensureOffrefyAnalyticsPixel(admin).catch((error) => {
        console.warn("[Offrefy] afterAuth pixel setup", error);
      });
      const { ensureThemeAppEmbedEnabled } = await import(
        "./services/themeAppEmbed.server"
      );
      await ensureThemeAppEmbedEnabled(admin).catch((error) => {
        console.warn("[Offrefy] afterAuth theme embed enable", error);
      });
      const { ensureOffrefyStorefrontScriptTag } = await import(
        "./services/ensureOffrefyStorefrontScriptTag.server"
      );
      await ensureOffrefyStorefrontScriptTag(admin, session.shop).catch(
        (error) => {
          console.warn("[Offrefy] afterAuth storefront ScriptTag", error);
        },
      );
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
export { BILLING_PLAN };
