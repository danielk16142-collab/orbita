import "server-only";
import { bestPostingWindows, nextPost, weekProgress, type CadencePost, type CadenceRule, type NextPost, type WeekProgress } from "@orbita/agent";
import type { AnalyticsData } from "@/lib/analytics/load";
import type { getSession } from "@/lib/session";

type Sb = NonNullable<Awaited<ReturnType<typeof getSession>>>["sb"];
export type Cadence = { next: NextPost; week: WeekProgress; hasStrategy: boolean; goalSaved: boolean };

/** Today's date on the client's calendar. */
export function localDay(timezone: string, at = new Date()): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at); }
  catch { return at.toISOString().slice(0, 10); }
}

/**
 * What to post next and how this week is going. Published posts come from the synced accounts when any is connected
 * (so posts made outside Orbita count too), otherwise from posts marked published in Orbita.
 */
export async function loadCadence(sb: Sb, clientId: string, analytics: AnalyticsData, now = new Date()): Promise<Cadence> {
  // posting_goal comes with migration 0014; until it is applied, use the default.
  let client = (await sb.from("clients").select("timezone, posting_goal").eq("id", clientId).maybeSingle()).data as { timezone: string; posting_goal?: number } | null;
  const goalSaved = !!client;
  if (!client) client = (await sb.from("clients").select("timezone").eq("id", clientId).maybeSingle()).data as { timezone: string } | null;
  const tz = client?.timezone ?? "UTC";
  const today = localDay(tz, now);
  const since = new Date(now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);

  const [posts, strategy, research] = await Promise.all([
    sb.from("posts").select("id, idea, type, network, status, planned_date").eq("client_id", clientId).gte("planned_date", since).order("planned_date").limit(300),
    sb.from("strategies").select("content").eq("client_id", clientId).eq("active", true).maybeSingle(),
    sb.from("research_notes").select("title, summary, kind").eq("client_id", clientId).in("kind", ["idea", "trend"]).order("created_at", { ascending: false }).limit(5),
  ]);
  const rows = (posts.data ?? []) as CadencePost[];
  const content = (strategy.data?.content ?? {}) as { topics?: string[]; cadence?: CadenceRule[] };
  const publishedDays = analytics.accounts.length
    ? analytics.posts.filter((p) => p.publishedAt).map((p) => localDay(tz, new Date(p.publishedAt!)))
    : rows.filter((p) => p.status === "published" && p.planned_date).map((p) => p.planned_date!);

  return {
    next: nextPost({
      today, planned: rows, topics: content.topics ?? [], research: research.data ?? [], usedIdeas: rows.map((p) => p.idea ?? "").filter(Boolean),
      windows: bestPostingWindows(analytics.posts), cadence: content.cadence ?? [],
    }),
    week: weekProgress(publishedDays, today, client?.posting_goal ?? 3),
    hasStrategy: !!strategy.data,
    goalSaved,
  };
}
