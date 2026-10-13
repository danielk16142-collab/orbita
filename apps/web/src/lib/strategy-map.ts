import "server-only";
import { dashboardFor, loadAnalyticsData } from "@/lib/analytics/load";
import { engagementRate, formatOfMedia, monthWeeks, type MapPillar, type MapPost } from "@orbita/agent";
import type { AgentActor } from "@/lib/agent/access";
import { localDay } from "@/lib/cadence";

export type StrategyContentView = {
  objectives?: string[]; pillars?: MapPillar[]; topics?: string[]; rationale?: string;
  series?: { name: string; subject: string; networks: string[]; formats: string[] }[];
  cadence?: { network: string; posts_per_week: number; best_days: string[]; best_time: string; why: string }[];
};
export type StrategyMapData = {
  month: string; today: string; strategy: { title: string; period: string; createdAt: string; content: StrategyContentView } | null;
  posts: MapPost[]; hasLive: boolean; goal: number;
  kpis: { followers: number | null; followersDelta: number | null; reach: number | null; reachDelta: number | null; engagement: number | null; published30: number | null };
};

/** Everything the Strategy Map shows for one month: the active strategy, planned posts, published posts and headline numbers. */
export async function loadStrategyMap(actor: AgentActor, month: string): Promise<StrategyMapData> {
  const tz = actor.client.timezone ?? "UTC";
  const weeks = monthWeeks(month);
  const from = weeks[0].start, to = weeks[weeks.length - 1].end;
  const [strat, planned, analytics, goalRow] = await Promise.all([
    actor.sb.from("strategies").select("title, period, content, created_at").eq("client_id", actor.clientId).eq("active", true).maybeSingle(),
    actor.sb.from("posts").select("id, idea, caption, type, network, status, planned_date, pillar").eq("client_id", actor.clientId).gte("planned_date", from).lte("planned_date", to).order("planned_date").limit(400),
    loadAnalyticsData(actor.sb, actor.clientId),
    actor.sb.from("clients").select("posting_goal").eq("id", actor.clientId).maybeSingle(),
  ]);
  const hasLive = analytics.accounts.length > 0;
  const posts: MapPost[] = (planned.data ?? [])
    // With a connected account, published posts arrive through the sync: do not show them twice.
    .filter((p) => !(hasLive && p.status === "published"))
    .map((p) => ({ id: p.id, kind: "plan", title: (p.idea || p.caption || "").split("\n")[0].slice(0, 140), format: p.type, network: p.network, status: p.status, date: p.planned_date!, pillar: p.pillar, caption: p.caption }));

  if (hasLive) {
    const net = new Map(analytics.accounts.map((a) => [a.id, a.network]));
    const read = (cols: string) => actor.sb.from("account_posts").select(cols)
      .eq("client_id", actor.clientId).gte("published_at", `${from}T00:00:00Z`).lte("published_at", `${to}T23:59:59Z`).order("published_at").limit(300);
    type Live = { id: string; account_id: string; published_at: string | null; caption: string | null; permalink: string | null; media_type: string | null; metrics: unknown; pillar?: string | null };
    // account_posts.pillar comes with migration 0016; until it is applied, read without it.
    let res = await read("id, account_id, published_at, caption, permalink, media_type, metrics, pillar");
    if (res.error) res = await read("id, account_id, published_at, caption, permalink, media_type, metrics");
    const live = (res.data ?? []) as unknown as Live[];
    for (const p of live) {
      if (!p.published_at) continue;
      const m = (p.metrics ?? {}) as Record<string, number>;
      posts.push({ id: p.id, kind: "live", title: (p.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 140), format: formatOfMedia(p.media_type), network: net.get(p.account_id) ?? "instagram",
        status: "published", date: localDay(tz, new Date(p.published_at)), pillar: p.pillar ?? null, permalink: p.permalink, caption: p.caption, metrics: m, rate: engagementRate(m), views: m.views ?? m.reach ?? null });
    }
  }
  const d = dashboardFor(analytics);
  const strategy = strat.data ? { title: strat.data.title, period: strat.data.period, createdAt: strat.data.created_at, content: strat.data.content as StrategyContentView } : null;
  return {
    month, today: localDay(tz), strategy, posts, hasLive, goal: (goalRow.data as { posting_goal?: number } | null)?.posting_goal ?? 3,
    kpis: { followers: d.tiles.followers.value, followersDelta: d.tiles.followers.delta, reach: d.tiles.reach.value, reachDelta: d.tiles.reach.delta, engagement: d.tiles.engagement.value, published30: d.tiles.posts.value },
  };
}
