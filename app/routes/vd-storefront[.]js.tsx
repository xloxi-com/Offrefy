import { vdStorefrontJsResponse } from "../utils/vdHostedStorefrontAssets.server";

export async function loader() {
  return vdStorefrontJsResponse();
}
