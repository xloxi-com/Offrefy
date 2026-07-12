/** Keep in sync with shopify.app.toml [access_scopes].scopes */
export const SHOPIFY_APP_SCOPES = [
  "read_discounts",
  "write_discounts",
  "read_products",
  "write_products",
  "read_locales",
  "read_themes",
  "read_orders",
  "write_pixels",
  "read_customer_events",
] as const;
