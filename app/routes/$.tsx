import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLocation } from "react-router";
import { NotFoundPolarisPage } from "../components/NotFoundPolarisPage";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const params = url.searchParams;

  if (params.get("shop") || params.get("host")) {
    throw redirect(`/app?${params.toString()}`);
  }

  return null;
};

export default function RootNotFoundRoute() {
  const { search } = useLocation();
  const homeHref = adminEmbeddedPath("/app", search);

  return <NotFoundPolarisPage homeHref={homeHref} />;
}
