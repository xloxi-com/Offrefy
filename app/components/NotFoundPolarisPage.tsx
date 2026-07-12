import {
  AppProvider as PolarisAppProvider,
  Page,
  EmptyState,
} from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { APP_DISPLAY_NAME } from "../branding";

type NotFoundPolarisPageProps = {
  homeHref?: string;
  embedded?: boolean;
};

export function NotFoundPolarisPage({
  homeHref = "/app",
  embedded = false,
}: NotFoundPolarisPageProps) {
  const page = (
    <Page>
      <EmptyState
        heading="Page not found"
        action={{
          content: `Back to ${APP_DISPLAY_NAME}`,
          url: homeHref,
        }}
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>
          There is no page at this address. Check the URL and try again, or
          return to {APP_DISPLAY_NAME}.
        </p>
      </EmptyState>
    </Page>
  );

  if (!embedded) {
    return (
      <PolarisAppProvider i18n={en}>
        <div style={{ padding: "1.5rem", maxWidth: "62rem", margin: "0 auto" }}>
          {page}
        </div>
      </PolarisAppProvider>
    );
  }

  return page;
}
