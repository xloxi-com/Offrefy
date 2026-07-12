import type { LoaderFunctionArgs } from "react-router";
import { useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { NotFoundPolarisPage } from "../components/NotFoundPolarisPage";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppNotFoundRoute() {
  const { search } = useLocation();
  const homeHref = adminEmbeddedPath("/app", search);

  return <NotFoundPolarisPage homeHref={homeHref} embedded />;
}
