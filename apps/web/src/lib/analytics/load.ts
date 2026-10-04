import "server-only";
import { analyticsForPrompt, bestPostingWindows, dashboardSummary, type DashboardData, type MetricRow, type PostRow } from "@orbita/agent";
import type { getSession } from "@/lib/session";

type Sb = NonNullable<Awaited<ReturnType<typeof getSession>>>["sb"];
const PAGE = 1000;

/** The API returns at most 1000 rows per request. Fetch every page, so long histories are never silently cut off. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export type AnalyticsData = { accounts: { id: string; network: string; handle: string | null; last_synced_at: string | null; status: string }[]; metrics: MetricRow[]; posts: PostRow[] };

/** Synced metrics and posts for one client, through the caller's own session (database policies apply). */
export async function loadAnalyticsData(sb: Sb, clientId: string, opts: { now?: Date } = {}): Promise<AnalyticsData> {
  const now = opts.now ?? new Date();
  const metricsSince = new Date(now.getTime() - 70 * 86_400_000).toISOString().slice(0, 10);
  const postsSince = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const { data: accounts } = await sb.from("social_accounts").select("id, network, handle, last_synced_at, status").eq("client_id", clientId);
  const byId = new Map((accounts ?? []).map((a) => [a.id, a.network as string]));
  if (!byId.size) return { accounts: [], metrics: [], posts: [] };

  const [m, p] = await Promise.all([
    all<{ account_id: string; day: string; metric: string; value: number }>((from, to) =>
      sb.from("metrics_daily").select("account_id, day, metric, value").eq("client_id", clientId).gte("day", metricsSince).in("metric", ["followers", "reach"]).order("day").range(from, to)),
    all<{ account_id: string; published_at: string | null; caption: string | null; permalink: string | null; media_type: string | null; metrics: Record<string, number> }>((from, to) =>
      sb.from("account_posts").select("account_id, published_at, caption, permalink, media_type, metrics").eq("client_id", clientId).gte("published_at", postsSince).order("published_at", { ascending: false }).range(from, to), 5),
  ]);
  return {
    accounts: (accounts ?? []) as AnalyticsData["accounts"],
    metrics: m.map((r) => ({ network: byId.get(r.account_id) ?? "unknown", day: r.day, metric: r.metric, value: Number(r.value) })),
    posts: p.map((r) => ({ network: byId.get(r.account_id) ?? "unknown", publishedAt: r.published_at, mediaType: r.media_type, caption: r.caption, permalink: r.permalink, metrics: r.metrics ?? {} })),
  };
}

export function dashboardFor(data: AnalyticsData, now = new Date()): DashboardData { return dashboardSummary(data.metrics, data.posts, now); }

/** Text summary for the agent (prompt and tool). `network` filters to one network, or "all". */
export function analyticsText(data: AnalyticsData, network = "all", now = new Date()): string {
  const m = network === "all" ? data.metrics : data.metrics.filter((r) => r.network === network);
  const p = network === "all" ? data.posts : data.posts.filter((r) => r.network === network);
  return analyticsForPrompt(dashboardSummary(m, p, now), bestPostingWindows(p), p);
}
