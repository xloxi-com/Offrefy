/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL?: string;
    DIRECT_URL?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    CRON_SECRET?: string;
  }
}

declare module "virtual:react-router/server-build" {
  import type { ServerBuild } from "react-router";
  const build: ServerBuild;
  export default build;
}
