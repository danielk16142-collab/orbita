import "server-only";
import type { SyncRepo } from "@orbita/connectors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sealTokens } from "./accounts";

type Acct = { id: string; clientId: string; network: string; externalId: string };
const chunks = <T,>(xs: T[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Service-role persistence for one account's sync. Metric and post writes are idempotent upserts. */
export function supabaseSyncRepo(a: Acct): SyncRepo {
  const db = supabaseAdmin();
  return {
    async startRun(accountId, clientId) {
      const { data, error } = await db.from("sync_runs").insert({ account_id: accountId, client_id: clientId }).select("id").single();
      if (error || !data) throw new Error("could not start sync run");
      return data.id as number;
    },
    async finishRun(runId, r) { await db.from("sync_runs").update({ status: r.status, rows: r.rows, error: r.error ?? null, finished_at: new Date().toISOString() }).eq("id", runId); },
    async saveTokens(accountId, tokens) {
      const { error } = await db.from("social_accounts").update({ encrypted_tokens: sealTokens(tokens, a.clientId, a.network, a.externalId) }).eq("id", accountId).eq("client_id", a.clientId);
      if (error) throw new Error("could not save tokens");
    },
    async upsertMetrics(accountId, clientId, rows) {
      for (const part of chunks(rows)) {
        const { error } = await db.from("metrics_daily").upsert(part.map((r) => ({ account_id: accountId, client_id: clientId, day: r.day, metric: r.metric, value: r.value })), { onConflict: "account_id,day,metric" });
        if (error) throw new Error("could not save metrics");
      }
    },
    async upsertPosts(accountId, clientId, posts) {
      for (const part of chunks(posts, 100)) {
        const { error } = await db.from("account_posts").upsert(part.map((p) => ({
          account_id: accountId, client_id: clientId, external_id: p.externalId, published_at: p.publishedAt, permalink: p.permalink,
          caption: p.caption?.slice(0, 2200) ?? null, media_type: p.mediaType, metrics: p.metrics, fetched_at: new Date().toISOString(),
        })), { onConflict: "account_id,external_id" });
        if (error) throw new Error("could not save posts");
      }
    },
    async markAccount(accountId, patch) { await db.from("social_accounts").update(patch).eq("id", accountId).eq("client_id", a.clientId); },
  };
}
