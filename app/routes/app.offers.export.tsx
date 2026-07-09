import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { buildVolumeDiscountOffersCsvExport } from "../utils/offersCsvExport.server";
import { parseOffersExportListParams } from "../utils/offersTableViewOrder.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const listParams = parseOffersExportListParams(new URL(request.url));
  const body = await buildVolumeDiscountOffersCsvExport(session.shop, {
    tab: listParams.tab,
    searchQuery: listParams.searchQuery,
    sort: listParams.sort,
  });
  if (body === null) {
    return new Response("No offers to export for these filters.", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="offrefy-offers.csv"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
};

export default function OffersExportStub() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
