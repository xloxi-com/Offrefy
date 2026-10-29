import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

const useCloudflare =
  process.env.WORKERS_CI === "1" ||
  process.env.DEPLOY_TARGET === "cloudflare";

export default {
  ssr: true,
  // Cloudflare Vite plugin emits under dist/; React Router defaults to build/.
  buildDirectory: useCloudflare ? "dist" : "build",
  // Required for @cloudflare/vite-plugin SSR environment (dist/ssr).
  future: useCloudflare
    ? {
        v8_viteEnvironmentApi: true,
      }
    : undefined,
  // Cloudflare Workers Builds sets WORKERS_CI=1. Keep Vercel preset for local/Vercel.
  presets: useCloudflare ? [] : [vercelPreset()],
} satisfies Config;
