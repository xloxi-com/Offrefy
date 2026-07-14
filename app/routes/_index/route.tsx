import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { withShopFromEmbeddedHost } from "../../utils/embeddedShop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = withShopFromEmbeddedHost(new URL(request.url));
  const params = url.searchParams;

  // Embedded admin home is `/app` (not `/`).
  if (params.get("shop") || params.get("host") || params.get("embedded")) {
    throw redirect(`/app?${params.toString()}`);
  }

  // Standalone visits (custom domain / vercel.app) go to the shop login form.
  throw redirect("/auth/login");
};
