import type { ActionFunctionArgs } from "react-router";
import { prisma as db } from "../db.server";
import { authenticateShopifyWebhook } from "../utils/webhookAuth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } =
    await authenticateShopifyWebhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const current = payload.current as string[];
  if (session) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });
  }
  return new Response(null, { status: 200 });
};
