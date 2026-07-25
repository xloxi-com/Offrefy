import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { installDocumentHeadGuard } from "./utils/documentHeadGuard.client";

// Before hydration / route CSS injection — Shopify embed can briefly lack <head>.
installDocumentHeadGuard();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
