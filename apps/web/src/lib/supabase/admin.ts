import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client: bypasses RLS. Server-only (the import above fails the build if it
 * reaches a client bundle). Use ONLY for: invitation acceptance, account creation/deletion,
 * audit-log writes, token writes and background jobs. Never pass user-controlled ids
 * through it without checking them first.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
