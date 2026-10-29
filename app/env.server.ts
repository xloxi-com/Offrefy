import { config } from "dotenv";
import { resolve } from "node:path";

/**
 * Load `.env` / `.env.local` into `process.env` for Node (loaders, actions, Prisma).
 * Vite only exposes `VITE_*` to the client; Supabase keys must stay server-side.
 * On Cloudflare Workers there is no local .env filesystem — secrets come from bindings.
 */
const isCloudflareWorker =
  typeof navigator !== "undefined" &&
  navigator.userAgent === "Cloudflare-Workers";

if (!isCloudflareWorker) {
  const root = process.cwd();
  config({ path: resolve(root, ".env") });
  config({ path: resolve(root, ".env.local"), override: true });
}
