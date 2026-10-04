import { ConnectorAuthError, ConnectorRateLimitError, type AccountInfo, type Connector, type DailyMetric, type PostRecord, type TokenSet } from "./types";

/** Persistence for syncing. The web app implements it with the service role (encrypting tokens on save). */
export interface SyncRepo {
  startRun(accountId: string, clientId: string): Promise<number>;
  finishRun(runId: number, r: { status: "ok" | "error"; rows: number; error?: string }): Promise<void>;
  saveTokens(accountId: string, tokens: TokenSet): Promise<void>;
  upsertMetrics(accountId: string, clientId: string, rows: DailyMetric[]): Promise<void>;
  upsertPosts(accountId: string, clientId: string, posts: PostRecord[]): Promise<void>;
  markAccount(accountId: string, patch: { status?: "active" | "expired"; last_synced_at?: string; last_error?: string | null; handle?: string | null; display_name?: string | null; token_expires_at?: string | null }): Promise<void>;
}

export type SyncResult = { ok: boolean; rows: number; error?: "reconnect" | "rate_limited" | "failed" };

const DAY = 86_400_000;
export const BACKFILL_DAYS = 30;
export const INCREMENTAL_DAYS = 3;
export const POST_LIMIT = 30;

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Totals the platforms only give as "now": we record one snapshot per day, which is what makes follower growth measurable. */
function snapshot(a: AccountInfo, now: Date): DailyMetric[] {
  const day = utcDay(now); const out: DailyMetric[] = [];
  const add = (metric: string, v: number | null | undefined) => { if (typeof v === "number") out.push({ day, metric, value: v }); };
  add("followers", a.followers); add("following", a.following); add("media_count", a.mediaCount); add("total_likes", a.totalLikes);
  return out;
}

/**
 * One account, one sync. Refreshes the token if needed, snapshots totals, pulls daily metrics and recent posts,
 * and records the outcome. Failures are classified (reconnect / rate limited / failed) and never include
 * provider messages, URLs or tokens. Upserts make a repeat of the same sync harmless.
 */
export async function syncAccount(
  deps: { connector: Connector; repo: SyncRepo; now?: () => Date },
  acct: { id: string; clientId: string; tokens: TokenSet; firstSync: boolean },
): Promise<SyncResult> {
  const { connector, repo } = deps; const now = (deps.now ?? (() => new Date()))();
  const runId = await repo.startRun(acct.id, acct.clientId);
  let rows = 0;
  try {
    let tokens = acct.tokens;
    if (connector.needsRefresh(tokens, now)) {
      tokens = await connector.refresh(tokens);
      await repo.saveTokens(acct.id, tokens);
      await repo.markAccount(acct.id, { token_expires_at: tokens.expiresAt ?? null });
    }
    const account = await connector.fetchAccount(tokens);
    const snap = snapshot(account, now);
    await repo.upsertMetrics(acct.id, acct.clientId, snap); rows += snap.length;

    const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const since = new Date(until.getTime() - (acct.firstSync ? BACKFILL_DAYS : INCREMENTAL_DAYS) * DAY);
    const daily = await connector.fetchDailyMetrics(tokens, { since, until });
    if (daily.length) { await repo.upsertMetrics(acct.id, acct.clientId, daily); rows += daily.length; }

    const posts = await connector.fetchPosts(tokens, { limit: POST_LIMIT });
    if (posts.length) { await repo.upsertPosts(acct.id, acct.clientId, posts); rows += posts.length; }

    await repo.markAccount(acct.id, { status: "active", last_synced_at: now.toISOString(), last_error: null, handle: account.handle, display_name: account.displayName });
    await repo.finishRun(runId, { status: "ok", rows });
    return { ok: true, rows };
  } catch (e) {
    const error: SyncResult["error"] = e instanceof ConnectorAuthError ? "reconnect" : e instanceof ConnectorRateLimitError ? "rate_limited" : "failed";
    if (error === "reconnect") await repo.markAccount(acct.id, { status: "expired", last_error: "reconnect" }).catch(() => {});
    else await repo.markAccount(acct.id, { last_error: error }).catch(() => {});
    await repo.finishRun(runId, { status: "error", rows, error }).catch(() => {});
    return { ok: false, rows, error };
  }
}
