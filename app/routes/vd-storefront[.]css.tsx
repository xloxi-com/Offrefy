import { vdStorefrontCssResponse } from "../utils/vdHostedStorefrontAssets.server";

export async function loader() {
  return vdStorefrontCssResponse();
}
