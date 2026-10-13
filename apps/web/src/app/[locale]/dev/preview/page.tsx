import { notFound } from "next/navigation";
import { fakeConnector, fakeEnabled } from "@orbita/connectors";
import { DashboardView } from "@/components/dashboard/client-dashboard";
import type { AnalyticsData } from "@/lib/analytics/load";
import { addDays, bestPostingWindows, lastWeekRecap, nextPost, weekAhead, weekProgress } from "@orbita/agent";
import { NextPostCard } from "@/components/cadence/next-post-card";
import { KickstartPanel } from "@/components/cadence/kickstart-panel";

/** Development only (CONNECTORS_FAKE=1, never in production): the dashboard rendered from generated data, to review the screens. */
export default async function Preview({ params }: { params: Promise<{ locale: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params;
  const now = new Date();
  const data: AnalyticsData = { accounts: [], metrics: [], posts: [] };
  for (const network of ["instagram", "tiktok"] as const) {
    const c = fakeConnector(network), t = { accessToken: "x" };
    data.accounts.push({ id: network, network, handle: `demo_${network}`, last_synced_at: now.toISOString(), status: "active" });
    const base = network === "instagram" ? 1180 : 480;
    for (let i = 30; i >= 0; i--) data.metrics.push({ network, day: new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10), metric: "followers", value: base + Math.round((30 - i) * (network === "instagram" ? 2.8 : 1.7)) + (i % 4) });
    const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    for (const m of await c.fetchDailyMetrics(t, { since: new Date(until.getTime() - 70 * 86_400_000), until })) if (m.metric === "reach") data.metrics.push({ network, day: m.day, metric: "reach", value: m.value });
    for (const p of await c.fetchPosts(t, { limit: 30 })) data.posts.push({ network, publishedAt: p.publishedAt, mediaType: p.mediaType, caption: p.caption, permalink: p.permalink, metrics: p.metrics });
  }
  const today = now.toISOString().slice(0, 10);
  const cadence = {
    next: nextPost({ today, planned: [], topics: ["Before and after: a homepage redesign in 60 seconds", "Three signs your website is costing you clients"], research: [], usedIdeas: [], windows: bestPostingWindows(data.posts), cadence: [{ network: "instagram", best_days: ["thursday"], best_time: "18:30" }] }),
    week: weekProgress(data.posts.filter((p) => p.publishedAt).map((p) => p.publishedAt!.slice(0, 10)), today, 3), hasStrategy: true, goalSaved: true, today,
    ahead: weekAhead([{ id: "p1", idea: "Reel", type: "reel", network: "instagram", status: "idea", planned_date: addDays(today, 2) }], today, 3),
    missed: [{ id: "00000000-0000-0000-0000-000000000009", idea: "Carousel: five questions to ask before hiring a web designer", type: "carousel", network: "instagram", status: "draft", planned_date: addDays(today, -3) }],
    recap: lastWeekRecap(data.posts, today, (iso) => iso.slice(0, 10)),
  };
  return (<main className="content"><p className="eyebrow">Preview (generated data)</p><h1>Home</h1>
    <KickstartPanel locale={locale} network="instagram" handle="dsigns_digitalsolutions" accountId="00000000-0000-0000-0000-000000000000" calendarHref="#"
      ready={{ id: "00000000-0000-0000-0000-000000000001", startDate: today, plan: {
        summary: "Your reels reach about three times more people than your static posts, but you posted only twice in the last month. The audience is there; consistency is the gap.",
        working: ["Before and after reels: 4.8% engagement, your best format", "Thursday evening posts get the most views"],
        gaps: ["Only 2 posts in the last 30 days", "Captions rarely end with a call to action"],
        best_formats: ["Reels: before and after redesigns", "Carousels: quick website tips"], best_times: "Thursday and Sunday evenings (early read: 14 posts).", posts_per_week: 3,
        plan: [{ day_offset: 1, format: "reel", title: "Before and after: a homepage redesign in 60 seconds", hook: "This homepage was losing clients. Watch what changed.", why: "Your best format" },
          { day_offset: 3, format: "carousel", title: "Three signs your website is costing you clients", hook: "Sign 1 is the one nobody notices.", why: "Strategy pillar: education" },
          { day_offset: 6, format: "static", title: "Client quote: Recovery House Medellín", hook: "+85% sessions in 30 days.", why: "Proof from your case studies" }],
      } }} />
    <NextPostCard cadence={cadence} locale={locale} postsBase="#" newPostHref="#" agentHref="#" staff />
    <DashboardView data={data} locale={locale} connectHref="#" now={now} /></main>);
}
