import "server-only";
import { syncAccount, type ConnectorNetwork, type SyncResult } from "@orbita/connectors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { connectorFor, openTokens } from "./accounts";
import { supabaseSyncRepo } from "./repo";

/** Sync one connected account (service role). Used after connecting, by the Refresh button and by the cron job. */
export async function runSync(accountId: string, opts: { backfill?: boolean } = {}): Promise<SyncResult | { ok: false; rows: 0; error: "failed" }> {
  const { data: a } = await supabaseAdmin().from("social_accounts").select("id, client_id, network, external_id, encrypted_tokens, last_synced_at, status").eq("id", accountId).maybeSingle();
  if (!a || a.status === "revoked" || !a.encrypted_tokens) return { ok: false, rows: 0, error: "failed" };
  // One sync per account at a time: refresh tokens can rotate, and two parallel refreshes could invalidate each other.
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count: running } = await supabaseAdmin().from("sync_runs").select("id", { count: "exact", head: true }).eq("account_id", a.id).eq("status", "running").gte("started_at", since);
  if ((running ?? 0) > 0) return { ok: true, rows: 0 }; // already syncing: nothing to do
  const network = a.network as ConnectorNetwork;
  const connector = connectorFor(network);
  if (!connector) return { ok: false, rows: 0, error: "failed" };
  let tokens; try { tokens = openTokens(a.encrypted_tokens, a.client_id, network, a.external_id); } catch { return { ok: false, rows: 0, error: "failed" }; }
  return syncAccount(
    { connector, repo: supabaseSyncRepo({ id: a.id, clientId: a.client_id, network, externalId: a.external_id }) },
    { id: a.id, clientId: a.client_id, tokens, firstSync: opts.backfill ?? !a.last_synced_at },
  );
}
