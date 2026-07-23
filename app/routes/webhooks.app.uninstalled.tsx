import type { ActionFunctionArgs } from "react-router";
import { prisma as db } from "../db.server";
import { markPostInstallPricingPending } from "../utils/shopPlan.server";
import { authenticateShopifyWebhook } from "../utils/webhookAuth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticateShopifyWebhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Next App Store install should land on Pricing once (settings row may remain).
  await markPostInstallPricingPending(shop).catch((error) => {
    console.warn("[Offrefy] uninstall post-install pricing flag", error);
  });

  return new Response(null, { status: 200 });
};
