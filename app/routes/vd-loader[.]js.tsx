import type { LoaderFunctionArgs } from "react-router";
import { vdLoaderJsResponse } from "../utils/vdHostedStorefrontAssets.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const origin =
    process.env.SHOPIFY_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  return vdLoaderJsResponse(origin);
}
