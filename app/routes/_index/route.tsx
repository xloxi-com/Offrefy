import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLocation } from "react-router";
import { NotFoundPolarisPage } from "../../components/NotFoundPolarisPage";
import { adminEmbeddedPath } from "../../utils/adminEmbeddedPath";
import { withShopFromEmbeddedHost } from "../../utils/embeddedShop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = withShopFromEmbeddedHost(new URL(request.url));
  const params = url.searchParams;

  // Embedded admin home is `/app` (not `/`). Always send shoppers into the app shell.
  if (params.get("shop") || params.get("host") || params.get("embedded")) {
    throw redirect(`/app?${params.toString()}`);
  }

  return null;
};

export default function IndexRoute() {
  const { search } = useLocation();
  const homeHref = adminEmbeddedPath("/app", search);

  return <NotFoundPolarisPage homeHref={homeHref} />;
}
