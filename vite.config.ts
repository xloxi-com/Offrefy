import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const useCloudflare =
  process.env.WORKERS_CI === "1" ||
  process.env.DEPLOY_TARGET === "cloudflare";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const prismaClientDir = path.join(rootDir, "node_modules", ".prisma", "client");

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  // Prisma must run from Node, not a Vite SSR bundle, or model delegates
  // (e.g. volumeDiscountCampaign.findMany) end up undefined.
  // Cloudflare Vite plugin forbids resolve.external in the Worker env.
  ...(useCloudflare
    ? {
        // Bundle generated Prisma client instead of leaving bare
        // `.prisma/client/default` imports that Workers cannot resolve.
        resolve: {
          alias: [
            {
              // Exact match only — keep `@prisma/client/runtime/*` resolving normally.
              find: /^@prisma\/client$/,
              replacement: path.join(prismaClientDir, "wasm.js"),
            },
            {
              find: ".prisma/client/default",
              replacement: path.join(prismaClientDir, "default.js"),
            },
            {
              find: ".prisma/client",
              replacement: prismaClientDir,
            },
          ],
          conditions: [
            "workerd",
            "worker",
            "module",
            "browser",
            "import",
            "default",
          ],
        },
      }
    : {
        ssr: {
          external: ["@prisma/client"],
        },
      }),
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    tailwindcss(),
    // Only on Cloudflare Workers Builds — keeps `shopify app:dev` on Node/Vercel.
    ...(useCloudflare
      ? [cloudflare({ viteEnvironment: { name: "ssr" } })]
      : []),
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 4096,
    target: "es2022",
    cssMinify: true,
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Do not force app components into a shared "admin-heavy" chunk.
          // That extracted one CSS file onto many routes; React Router then
          // re-injects it via document.head.appendChild on every loader and can
          // crash the embedded admin when head is briefly unavailable.
          if (!id.includes("node_modules")) return;
          if (id.includes("@shopify/polaris-icons")) return "polaris-icons";
          if (id.includes("@shopify/polaris")) return "polaris";
          if (id.includes("@shopify/app-bridge")) return "app-bridge";
          if (id.includes("lucide-react")) return "lucide";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/")
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      "@shopify/app-bridge-react",
      "@shopify/polaris",
      "@shopify/polaris-icons",
      "lucide-react",
    ],
    exclude: ["@prisma/client"],
  },
}) satisfies UserConfig;
