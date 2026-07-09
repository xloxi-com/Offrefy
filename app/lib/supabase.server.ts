import "../env.server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const u = raw.trim().replace(/\/+$/, "");
  return u || undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    normalizeSupabaseUrl(process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use only in loaders, actions, and other server code.
 * Never import this module from client-side React components.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to `.env` in the project root.",
    );
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}

/**
 * Optional: anon client for server routes that should respect RLS (rare in embedded admin apps).
 */
export function getSupabaseAnon(): SupabaseClient {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_ANON_KEY to use the anon client.",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
