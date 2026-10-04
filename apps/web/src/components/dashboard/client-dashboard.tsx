import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { getSession } from "@/lib/session";
import { dashboardFor, loadAnalyticsData, type AnalyticsData } from "@/lib/analytics/load";
import { StatTile } from "./stat-tile";
import { TrendChart, type ChartSeries } from "./trend-chart";

type Sb = NonNullable<Awaited<ReturnType<typeof getSession>>>["sb"];
// Fixed per network (color follows the entity). Validated pair; see docs/dataviz.md.
const NETWORK_COLOR: Record<string, string> = { instagram: "var(--series-1)", tiktok: "var(--series-2)", linkedin: "var(--series-3)", youtube: "var(--series-4)", facebook: "var(--series-5)" };
const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", facebook: "Facebook" };

/** Headline numbers, the follower trend, per-network summary and the best recent posts for ONE client. */
export async function ClientDashboard({ sb, clientId, locale, connectHref }: { sb: Sb; clientId: string; locale: string; connectHref: string }) {
  return <DashboardView data={await loadAnalyticsData(sb, clientId)} locale={locale} connectHref={connectHref} />;
}

/** Presentational: renders already-loaded analytics. Also used by the development preview. */
export async function DashboardView({ data, locale, connectHref, now }: { data: AnalyticsData; locale: string; connectHref: string; now?: Date }) {
  const t = await getTranslations("dashboard");
  const d = dashboardFor(data, now);
  const nf = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const pf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const dateF = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });

  if (data.accounts.length === 0) {
    return (<section className="card"><h2>{t("emptyTitle")}</h2><p>{t("emptyText")}</p><Link className="btn" href={connectHref}>{t("connectCta")}</Link></section>);
  }
  const synced = data.accounts.map((a) => a.last_synced_at).filter(Boolean).sort().at(-1);
  const series: ChartSeries[] = d.followers.map((f) => ({ id: f.network, label: NETWORK_LABEL[f.network] ?? f.network, color: NETWORK_COLOR[f.network] ?? "var(--series-1)", points: f.points.map((p) => ({ x: p.day, y: p.value })) }));
  const vs = t("vsPrevious");

  return (
    <>
      <p className="stat-vs">{synced ? t("updated", { when: new Date(synced).toLocaleString(locale) }) : t("firstUpdate")}</p>
      <div className="grid tiles">
        <StatTile label={t("cards.followers")} tile={d.tiles.followers} locale={locale} kind="count" vsLabel={t("vsMonthAgo")} noData={t("noData")} />
        <StatTile label={t("cards.reach")} tile={d.tiles.reach} locale={locale} kind="count" vsLabel={vs} noData={t("reachNote")} />
        <StatTile label={t("cards.engagement")} tile={d.tiles.engagement} locale={locale} kind="percent" vsLabel={vs} noData={t("noData")} />
        <StatTile label={t("cards.postsPublished")} tile={d.tiles.posts} locale={locale} kind="count" vsLabel={vs} noData={t("noData")} />
      </div>

      {series.some((s) => s.points.length > 0) && (
        <div style={{ marginTop: "1.25rem" }}>
          <TrendChart series={series} locale={locale} title={t("followersChart")} tableLabel={t("tableView")} dateLabel={t("date")} />
          {series.every((s) => s.points.length < 3) && <p className="stat-vs">{t("trendBuilding")}</p>}
        </div>
      )}

      <section className="card" style={{ marginTop: "1.25rem" }}>
        <h2>{t("byNetwork")}</h2>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th scope="col">{t("network")}</th><th scope="col">{t("cards.followers")}</th><th scope="col">{t("postsLast30")}</th><th scope="col">{t("cards.engagement")}</th></tr></thead>
          <tbody>{d.perNetwork.map((n) => (
            <tr key={n.network}><th scope="row"><span className="swatch" style={{ background: NETWORK_COLOR[n.network] }} aria-hidden="true" /> {NETWORK_LABEL[n.network] ?? n.network}</th>
              <td>{n.followers === null ? "—" : nf.format(n.followers)}</td><td>{n.posts30}</td><td>{n.avgRate === null ? "—" : pf.format(n.avgRate)}</td></tr>))}</tbody>
        </table></div>
      </section>

      <section className="card" style={{ marginTop: "1.25rem" }}>
        <h2>{t("topPosts")}</h2>
        {d.topPosts.length === 0 ? <p>{t("noPosts")}</p> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th scope="col">{t("post")}</th><th scope="col">{t("network")}</th><th scope="col">{t("date")}</th><th scope="col">{t("views")}</th><th scope="col">{t("cards.engagement")}</th></tr></thead>
            <tbody>{d.topPosts.map((p, i) => (
              <tr key={i}>
                <th scope="row">{p.permalink ? <a href={p.permalink} target="_blank" rel="noopener noreferrer nofollow">{(p.caption || t("untitled")).slice(0, 70)}</a> : (p.caption || t("untitled")).slice(0, 70)}</th>
                <td><span className="swatch" style={{ background: NETWORK_COLOR[p.network] }} aria-hidden="true" /> {NETWORK_LABEL[p.network] ?? p.network}</td>
                <td>{p.publishedAt ? dateF.format(new Date(p.publishedAt)) : "—"}</td>
                <td>{nf.format((p.metrics.views ?? p.metrics.reach ?? 0) as number)}</td>
                <td><span className="rate-bar" style={{ width: `${Math.min(100, (p.rate ?? 0) * 400)}px` }} aria-hidden="true" /> {pf.format(p.rate ?? 0)}</td>
              </tr>))}</tbody>
          </table></div>)}
      </section>
    </>
  );
}
