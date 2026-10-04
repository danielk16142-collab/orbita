import { notFound } from "next/navigation";
import { fakeConnector, fakeEnabled } from "@orbita/connectors";
import { DashboardView } from "@/components/dashboard/client-dashboard";
import type { AnalyticsData } from "@/lib/analytics/load";

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
  return (<main className="content"><p className="eyebrow">Preview (generated data)</p><h1>Home</h1><DashboardView data={data} locale={locale} connectHref="#" now={now} /></main>);
}
