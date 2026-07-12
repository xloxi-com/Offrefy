import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";

/** Legacy URL — setup is now the app home at `/app`. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(adminEmbeddedPath("/app", url.search));
};

export default function AppSetupRedirect() {
  return null;
}
