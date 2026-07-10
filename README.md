# Offrefy — Unlimited Volume Discounts App (Shopify 25-Limit Bypass)

This project implements a Shopify app designed to bypass the platform's limit of **25 active automatic discounts** on standard plans (such as Shopify Basic). It allows merchants to create and manage **unlimited discount campaigns** (1000+ campaigns/products) that run independently, using only **one automatic discount slot** in Shopify.

---

## 🏗️ Core Architecture & Bypassing the 25 Slot Limit

### The 25 Limit Bypass Explanation
Shopify limits the number of *automatic discount rules (functions/nodes)* registered in a store to 25. It does **not** limit how many product evaluations a single registered function can perform.
- **Legacy Approach:** Creating a separate Shopify automatic discount record per campaign. This hits the 25-limit immediately.
- **This App's Approach:** Registers **one single automatic discount function** (`Offrefy — Quantity breaks`) on install. Inside this single slot, all active discount rules are computed dynamically at cart evaluation runtime using database looks/proxy fetch rules.

### Metafields & Remote App-Proxy Lookup Bridge
To support unlimited products and bypass metafield size caps (128KB Shopify limit per metafield namespace):
1. **Small/Standard Catalogs (Metafield Mode):** Active rules are compressed and sharded across up to 5 discount metafield chunks (`campaigns` to `campaigns_4`).
2. **Large Catalogs / Heavy Load (API Proxy Mode):** If rules exceed metafield limits, the app automatically switches to API mode.
3. **Dynamic Fetching:** The Shopify Function's fetch hook (`cartLinesDiscountsGenerateFetch`) POSTs to the app proxy endpoint `/apps/volume-discount/cart-rules` to fetch exact discount rules for the products currently in the customer's cart.
4. **Capped Cart Execution (Shopify Limit Compliance):** While you can have 1,000+ active rules, Shopify's checkout enforces a limit on the number of discount allocations returned. The app caps discount calculations to the first **25 distinct product IDs** in the cart.

---

## 📂 Project Structure & Key Files

### 1. Database Schema
Defined in `prisma/schema.prisma` containing:
- **`VolumeDiscountCampaign`**: Holds campaign settings, customer tags targeting, status, and widget display.
- **`DiscountRule`**: Fast-lookup index mapping `productId` and `variantId` to rules for cart-rules API query optimization.
- **`VolumeDiscountShopState`**: Stores the single active automatic discount ID (`functionDiscountId`) per shop.

### 2. Admin UI (Remix / React Router & Polaris)
- **[app/routes/app._index.tsx](file:///d:/Code%20Project/shopify%20apps/Offrefy/Offrefys/volume-discount/app/routes/app._index.tsx)**: Main dashboard showing campaigns list with bulk operations and "Sync all" controls.
- **[app/routes/app.volume-discount.new.tsx](file:///d:/Code%20Project/shopify%20apps/Offrefy/Offrefys/volume-discount/app/routes/app.volume-discount.new.tsx)**: View for creating volume discounts with tiered quantity break forms.
- **[app/routes/app.offers.import.tsx](file:///d:/Code%20Project/shopify%20apps/Offrefy/Offrefys/volume-discount/app/routes/app.offers.import.tsx)**: Bulk CSV import interface to load hundreds of offers at once.

### 3. Shopify Function Extension
Located in `extensions/volume-discount-fn`:
- **[src/fetch.js](file:///d:/Code%20Project/shopify%20apps/Offrefy/Offrefys/volume-discount/extensions/volume-discount-fn/src/fetch.js)**: Runs in `cart.lines.discounts.generate.fetch` target, sending cart product IDs (up to 25) to the app proxy server.
- **[src/run.js](file:///d:/Code%20Project/shopify%20apps/Offrefy/Offrefys/volume-discount/extensions/volume-discount-fn/src/run.js)**: Runs in `cart.lines.discounts.generate.run` target, reading rule lists and evaluating/capping discounts to up to 25 cart products.
- **[shopify.extension.toml](file:///d:/Code%20Project/shopify%20apps/Offrefy/Offrefys/volume-discount/extensions/volume-discount-fn/shopify.extension.toml)**: Standard configuration file registering extension targets and enabling `network_access`.

### 4. Sync Services
- **[app/services/volumeDiscountFunctionSync.server.ts](file:///d:/Code%20Project/shopify%20apps/Offrefy/Offrefys/volume-discount/app/services/volumeDiscountFunctionSync.server.ts)**: Registers or updates the single automatic app discount node via Shopify GraphQL, setting metafield rules.

---

## ⚡ Setup & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development
Starts Vite dev server, triggers tunnel generation, and watches for code changes:
```bash
npm run dev
```

### 3. Compile Shopify Function
Rebuild JS source into WASM target manually when updates are made to the extension:
```bash
cd extensions/volume-discount-fn
npm run build
```

---

## 🔧 Robust Development Configuration
- **Auth Fallback:** In local dev and tunnels, signature validations can fail due to domain mapping mismatches. The app proxy endpoints fallback to parsing query parameters/headers to resolve the `shop` context securely.
- **DB Connection Tuning:** Prisma connection limits are set to `10` to avoid pool deadlocks when storefront checkouts and admin CRUD requests fire concurrently.
