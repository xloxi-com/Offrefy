type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const WEB_PIXEL_CREATE = `#graphql
  mutation OffrefyEnsureWebPixel($settings: JSON!) {
    webPixelCreate(webPixel: { settings: $settings }) {
      userErrors {
        code
        field
        message
      }
      webPixel {
        id
      }
    }
  }`;

/** Avoid re-hitting Admin GraphQL on every analytics visit within a warm instance. */
const ensuredUntil = new Map<string, number>();
const ENSURE_TTL_MS = 30 * 60 * 1000;

export async function ensureOffrefyAnalyticsPixel(
  admin: AdminGraphql,
): Promise<void> {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) {
    console.warn("[Offrefy] ensureOffrefyAnalyticsPixel: missing SHOPIFY_APP_URL");
    return;
  }

  const now = Date.now();
  const until = ensuredUntil.get(appUrl) ?? 0;
  if (until > now) return;

  try {
    const res = await admin.graphql(WEB_PIXEL_CREATE, {
      variables: {
        settings: JSON.stringify({ appUrl }),
      },
    });
    const body = (await res.json()) as {
      data?: {
        webPixelCreate?: {
          userErrors?: Array<{ code?: string; message?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    const userErrors = body.data?.webPixelCreate?.userErrors ?? [];
    const gqlErrors = body.errors ?? [];
    const messages = [
      ...gqlErrors.map((error) => error.message).filter(Boolean),
      ...userErrors.map((error) => error.message).filter(Boolean),
    ];

    const alreadyExists = messages.some((message) =>
      /already|taken|exists/i.test(String(message)),
    );

    if (messages.length && !alreadyExists) {
      console.warn("[Offrefy] ensureOffrefyAnalyticsPixel", messages.join("; "));
      return;
    }

    ensuredUntil.set(appUrl, now + ENSURE_TTL_MS);
  } catch (error) {
    console.warn("[Offrefy] ensureOffrefyAnalyticsPixel", error);
  }
}
