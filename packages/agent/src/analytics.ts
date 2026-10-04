/** Pure analytics over synced account data. Shared by the dashboard and the agent so both always show the same numbers. */

export type MetricRow = { network: string; day: string; metric: string; value: number };
export type PostRow = { network: string; publishedAt: string | null; mediaType: string | null; caption: string | null; permalink: string | null; metrics: Record<string, number> };
export type Tile = { value: number | null; delta: number | null; deltaKind: "absolute" | "percent" | "points"; spark: number[] };
export type FollowersSeries = { network: string; points: { day: string; value: number }[] };
export type RatedPost = PostRow & { engagement: number; rate: number | null };

const DAY = 86_400_000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Likes + comments + shares + saves. Instagram's own interactions total is used when it is the only thing we have. */
export function engagementOf(m: Record<string, number>): number {
  const parts = num(m.likes) + num(m.comments) + num(m.shares) + num(m.saves);
  return parts > 0 ? parts : num(m.interactions);
}
/** Engagement divided by views (or reach when views are missing). Null when there is no audience number to divide by. */
export function engagementRate(m: Record<string, number>): number | null {
  const audience = num(m.views) || num(m.reach);
  return audience > 0 ? engagementOf(m) / audience : null;
}
export const rate = (p: PostRow): RatedPost => ({ ...p, engagement: engagementOf(p.metrics), rate: engagementRate(p.metrics) });

const ts = (p: PostRow) => (p.publishedAt ? Date.parse(p.publishedAt) : NaN);
const within = (t: number, from: number, to: number) => t >= from && t < to;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const last = <T,>(xs: T[], n: number) => xs.slice(Math.max(0, xs.length - n));

/** Sum per day across accounts/networks, ascending. */
function dailySum(rows: MetricRow[], metric: string): { day: string; value: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) if (r.metric === metric) by.set(r.day, (by.get(r.day) ?? 0) + r.value);
  return [...by].map(([day, value]) => ({ day, value })).sort((a, b) => a.day.localeCompare(b.day));
}

export function followersByNetwork(metrics: MetricRow[]): FollowersSeries[] {
  const networks = [...new Set(metrics.filter((m) => m.metric === "followers").map((m) => m.network))].sort();
  return networks.map((network) => ({ network, points: dailySum(metrics.filter((m) => m.network === network), "followers") }));
}

export type DashboardData = {
  hasData: boolean;
  tiles: { followers: Tile; reach: Tile; engagement: Tile; posts: Tile };
  followers: FollowersSeries[];
  topPosts: RatedPost[];
  perNetwork: { network: string; followers: number | null; posts30: number; avgRate: number | null }[];
};

/** Everything the dashboard shows. `now` is injectable for tests. Windows are the last 30 days vs the 30 days before. */
export function dashboardSummary(metrics: MetricRow[], posts: PostRow[], now = new Date()): DashboardData {
  const t = now.getTime();
  const cur: [number, number] = [t - 30 * DAY, t + DAY], prev: [number, number] = [t - 60 * DAY, t - 30 * DAY];
  const dayMs = (d: string) => Date.parse(d + "T12:00:00Z");

  // Followers: latest total, change vs the oldest snapshot inside the last 30 days (needs at least two snapshots).
  const f = dailySum(metrics, "followers");
  const fNow = f.length ? f[f.length - 1].value : null;
  const inWindow = f.filter((p) => dayMs(p.day) >= cur[0]);
  const fDelta = inWindow.length >= 2 ? inWindow[inWindow.length - 1].value - inWindow[0].value : null;

  const reach = dailySum(metrics, "reach");
  const reachCur = reach.filter((p) => within(dayMs(p.day), ...cur)), reachPrev = reach.filter((p) => within(dayMs(p.day), ...prev));
  const reachSum = reachCur.reduce((a, p) => a + p.value, 0), reachPrevSum = reachPrev.reduce((a, p) => a + p.value, 0);

  const rated = posts.map(rate).filter((p) => !Number.isNaN(ts(p)));
  const pCur = rated.filter((p) => within(ts(p), ...cur)), pPrev = rated.filter((p) => within(ts(p), ...prev));
  const rCur = avg(pCur.flatMap((p) => (p.rate === null ? [] : [p.rate]))), rPrev = avg(pPrev.flatMap((p) => (p.rate === null ? [] : [p.rate])));
  const chrono = [...rated].sort((a, b) => ts(a) - ts(b));

  const networks = [...new Set([...metrics.map((m) => m.network), ...posts.map((p) => p.network)])].sort();
  return {
    hasData: metrics.length > 0 || posts.length > 0,
    tiles: {
      followers: { value: fNow, delta: fDelta, deltaKind: "absolute", spark: last(f, 12).map((p) => p.value) },
      reach: { value: reachCur.length ? reachSum : null, delta: reachCur.length && reachPrevSum > 0 ? (reachSum - reachPrevSum) / reachPrevSum : null, deltaKind: "percent", spark: last(reach, 12).map((p) => p.value) },
      engagement: { value: rCur, delta: rCur !== null && rPrev !== null ? (rCur - rPrev) * 100 : null, deltaKind: "points", spark: last(chrono.flatMap((p) => (p.rate === null ? [] : [p.rate * 100])), 12) },
      posts: { value: pCur.length || (rated.length ? 0 : null), delta: rated.length && pPrev.length ? pCur.length - pPrev.length : null, deltaKind: "absolute", spark: weeklyCounts(rated, t, 12) },
    },
    followers: followersByNetwork(metrics),
    topPosts: [...pCur].filter((p) => p.rate !== null).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)).slice(0, 5),
    perNetwork: networks.map((network) => {
      const nf = dailySum(metrics.filter((m) => m.network === network), "followers");
      const np = pCur.filter((p) => p.network === network);
      return { network, followers: nf.length ? nf[nf.length - 1].value : null, posts30: np.length, avgRate: avg(np.flatMap((p) => (p.rate === null ? [] : [p.rate]))) };
    }),
  };
}

function weeklyCounts(posts: RatedPost[], t: number, weeks: number): number[] {
  const out = Array<number>(weeks).fill(0);
  for (const p of posts) { const w = Math.floor((t - ts(p)) / (7 * DAY)); if (w >= 0 && w < weeks) out[weeks - 1 - w]++; }
  return out;
}

// ---- best posting windows ----
export type Window = { weekday: number; bucket: "morning" | "midday" | "afternoon" | "evening" | "night"; avgRate: number; posts: number };
export type WindowsResult = { windows: Window[]; confidence: "low" | "medium"; sample: number } | null;

const bucketOf = (h: number): Window["bucket"] => (h >= 6 && h < 11 ? "morning" : h >= 11 && h < 15 ? "midday" : h >= 15 && h < 19 ? "afternoon" : h >= 19 && h < 23 ? "evening" : "night");

/**
 * Which weekday + time-of-day windows earned the highest engagement rate. Times are UTC (platform timestamps), so the caller must
 * say so. Needs enough posts to mean anything: below `minPosts` returns null, and every window needs at least 2 posts.
 */
export function bestPostingWindows(posts: PostRow[], opts: { minPosts?: number; top?: number } = {}): WindowsResult {
  const rated = posts.map(rate).filter((p) => p.rate !== null && !Number.isNaN(ts(p)));
  if (rated.length < (opts.minPosts ?? 12)) return null;
  const groups = new Map<string, number[]>();
  for (const p of rated) { const d = new Date(ts(p)); const k = `${d.getUTCDay()}|${bucketOf(d.getUTCHours())}`; groups.set(k, [...(groups.get(k) ?? []), p.rate!]); }
  const windows = [...groups].filter(([, v]) => v.length >= 2).map(([k, v]) => { const [wd, bucket] = k.split("|"); return { weekday: Number(wd), bucket: bucket as Window["bucket"], avgRate: avg(v)!, posts: v.length }; })
    .sort((a, b) => b.avgRate - a.avgRate).slice(0, opts.top ?? 3);
  if (!windows.length) return null;
  return { windows, confidence: rated.length >= 40 ? "medium" : "low", sample: rated.length };
}

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** Compact, factual text for the agent's prompt. Contains numbers only from the data: the agent must not add its own. */
export function analyticsForPrompt(d: DashboardData, w: WindowsResult, posts: PostRow[]): string {
  if (!d.hasData) return "(no account is connected yet, so there are no analytics: posting times are assumptions and must be labelled as such)";
  const L: string[] = [];
  for (const n of d.perNetwork) L.push(`${n.network}: ${n.followers ?? "n/a"} followers; ${n.posts30} posts in the last 30 days; average engagement rate ${pct(n.avgRate)} (likes+comments+shares+saves per view)`);
  const t = d.tiles;
  if (t.followers.delta !== null) L.push(`Followers change over the last 30 days: ${t.followers.delta >= 0 ? "+" : ""}${t.followers.delta}`);
  if (t.reach.value !== null) L.push(`Instagram reach, last 30 days: ${t.reach.value}${t.reach.delta !== null ? ` (${(t.reach.delta * 100).toFixed(0)}% vs the 30 days before)` : ""}`);
  const rated = posts.map(rate).filter((p) => p.rate !== null);
  const sorted = [...rated].sort((a, b) => b.rate! - a.rate!);
  const brief = (p: RatedPost) => `${p.network} ${p.mediaType ?? "post"} on ${p.publishedAt?.slice(0, 10) ?? "?"}: ${pct(p.rate)} engagement, ${num(p.metrics.views) || num(p.metrics.reach)} views — "${(p.caption ?? "").replace(/\s+/g, " ").slice(0, 90)}"`;
  if (sorted.length >= 3) { L.push("Best recent posts:"); sorted.slice(0, 3).forEach((p) => L.push("  " + brief(p))); L.push("Weakest recent posts:"); sorted.slice(-2).forEach((p) => L.push("  " + brief(p))); }
  const byType = new Map<string, number[]>();
  for (const p of rated) { const k = `${p.network} ${p.mediaType ?? "post"}`; byType.set(k, [...(byType.get(k) ?? []), p.rate!]); }
  const types = [...byType].filter(([, v]) => v.length >= 3).map(([k, v]) => `${k}: ${pct(avg(v))} (${v.length} posts)`);
  if (types.length) L.push("Average engagement by format: " + types.join("; "));
  if (w) L.push(`Best posting windows (UTC, ${w.sample} posts analysed, ${w.confidence} confidence): ` + w.windows.map((x) => `${WD[x.weekday]} ${x.bucket} (${pct(x.avgRate)} over ${x.posts} posts)`).join("; "));
  else L.push("Not enough post history to recommend posting windows from data: label any suggested times as assumptions.");
  return L.join("\n");
}
