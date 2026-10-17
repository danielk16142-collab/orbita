import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * A database session for an API key's agent user, so every query runs under row-level security as that team member.
 * The server mints it with a one-time magic-link token (never emailed, never leaves the server) and keeps it in
 * memory until shortly before it expires. The agent user has no password and cannot open the app's own login.
 */
const cache = new Map<string, { token: string; exp: number }>();
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** The agent user's sign-in email: on this app's own domain, never sent to. */
export const agentEmail = (keyId: string) => `agent-${keyId}@${(() => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname || "orbita.local"; } catch { return "orbita.local"; } })()}`;

async function mint(email: string): Promise<{ token: string; exp: number }> {
  const { data: link, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link?.properties?.hashed_token) throw new Error(`agent session: link failed (${error?.status ?? "?"})`);
  const verifier = createClient(url(), anon(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: vErr } = await verifier.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (vErr || !data.session) throw new Error(`agent session: verify failed (${vErr?.status ?? "?"})`);
  return { token: data.session.access_token, exp: (data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000 };
}

export async function agentClient(keyId: string, agentUserId: string): Promise<SupabaseClient> {
  let s = cache.get(keyId);
  if (!s || s.exp - Date.now() < 5 * 60_000) {
    // The email stored on the agent user (not recomputed), so a later change of app domain does not break keys.
    const { data, error } = await supabaseAdmin().auth.admin.getUserById(agentUserId);
    if (error || !data.user?.email) throw new Error(`agent session: user lookup failed (${error?.status ?? "?"})`);
    s = await mint(data.user.email); cache.set(keyId, s);
  }
  return createClient(url(), anon(), { global: { headers: { Authorization: `Bearer ${s.token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}

/** Forget a cached session (after rotating or revoking a key). */
export const dropAgentSession = (keyId: string) => cache.delete(keyId);
