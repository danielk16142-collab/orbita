import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { bestPostingWindows, dashboardSummary, rate, type AuditReport } from "@orbita/agent";
import { loadAnalyticsData, type AnalyticsData } from "@/lib/analytics/load";
import { resolveAgentActor } from "@/lib/agent/access";
import type { ClientContext } from "@/lib/agent/context";
import { NETWORK_LABEL } from "@/components/posts/shared";

type Props = {
  locale: string; data: AnalyticsData; audit: ClientContext["audit"]; strategy: ClientContext["strategy"]; pendingSuggestions: number;
  links: { connect: string; audit: string; recommend: string; strategy: string; review: string };
  now?: Date;
};

/** Format performance from real posts: average engagement rate per format, only where there are at least 2 posts. */
function byFormat(posts: AnalyticsData["posts"]) {
  const groups = new Map<string, number[]>();
  for (const p of posts.map(rate)) if (p.rate !== null) groups.set(p.mediaType ?? "post", [...(groups.get(p.mediaType ?? "post") ?? []), p.rate]);
  return [...groups].filter(([, v]) => v.length >= 2).map(([format, v]) => ({ format, posts: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => b.avg - a.avg);
}

/**
 * Insights and recommendations for one client. Every number comes from connected accounts and every recommendation from the
 * latest audit or strategy, each labelled with its source. Nothing is invented here; open questions go to the agent.
 */
export async function InsightsView({ locale, data, audit, strategy, pendingSuggestions, links, now = new Date() }: Props) {
  const t = await getTranslations("insights");
  const ta = await getTranslations("agent");
  const pf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const d = dashboardSummary(data.metrics, data.posts, now);
  const formats = byFormat(data.posts);
  const windows = bestPostingWindows(data.posts);
  const wd = (n: number) => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + n)));
  const bestNetwork = [...d.perNetwork].filter((n) => n.avgRate !== null).sort((a, b) => (b.avgRate ?? 0) - (a.avgRate ?? 0))[0];
  const top = d.topPosts[0];
  const recs = audit ? [...audit.opportunities.map((x) => ({ kind: "opportunity", text: x })), ...audit.weaknesses.map((x) => ({ kind: "fix", text: x }))] : [];

  return (
    <div className="stack">
      <div className="info-grid three">
        <section className="card insight">
          <p className="eyebrow">{t("bestNetwork")}</p>
          {bestNetwork ? <><p className="insight-value">{NETWORK_LABEL[bestNetwork.network] ?? bestNetwork.network}</p><p className="stat-vs">{t("avgRate", { rate: pf.format(bestNetwork.avgRate!) })}</p></> : <p className="stat-vs">{t("needData")}</p>}
        </section>
        <section className="card insight">
          <p className="eyebrow">{t("bestFormat")}</p>
          {formats[0] ? <><p className="insight-value">{t.has(`formats.${formats[0].format}`) ? t(`formats.${formats[0].format}`) : formats[0].format}</p><p className="stat-vs">{t("avgRateOf", { rate: pf.format(formats[0].avg), count: formats[0].posts })}</p></> : <p className="stat-vs">{t("needData")}</p>}
        </section>
        <section className="card insight">
          <p className="eyebrow">{t("bestTime")}</p>
          {windows ? <><p className="insight-value">{wd(windows.windows[0].weekday)}, {t(`buckets.${windows.windows[0].bucket}`)}</p><p className="stat-vs">{t("utcNote", { count: windows.sample })}{windows.confidence === "low" ? ` · ${t("lowConfidence")}` : ""}</p></> : <p className="stat-vs">{t("needMorePosts")}</p>}
        </section>
      </div>

      {!d.hasData && (
        <section className="card callout">
          <h2>{t("connectTitle")}</h2><p>{t("connectText")}</p>
          <Link className="btn small" href={links.connect}>{t("connect")}</Link>
        </section>
      )}

      {formats.length > 1 && (
        <section className="card">
          <h2>{t("formatTitle")}</h2>
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th scope="col">{t("format")}</th><th scope="col">{t("posts")}</th><th scope="col">{t("engagement")}</th></tr></thead>
            <tbody>{formats.map((f) => <tr key={f.format}><th scope="row">{t.has(`formats.${f.format}`) ? t(`formats.${f.format}`) : f.format}</th><td>{f.posts}</td><td><span className="rate-bar" style={{ width: `${Math.round((f.avg / formats[0].avg) * 80)}px` }} />{pf.format(f.avg)}</td></tr>)}</tbody>
          </table></div>
          {windows && windows.windows.length > 1 && <p className="stat-vs">{t("otherWindows")}: {windows.windows.slice(1).map((w) => `${wd(w.weekday)} ${t(`buckets.${w.bucket}`)}`).join(" · ")}</p>}
        </section>
      )}

      {top && (
        <section className="card">
          <h2>{t("topPost")}</h2>
          <p>{top.permalink ? <a href={top.permalink} target="_blank" rel="noopener noreferrer nofollow">{(top.caption ?? "—").slice(0, 140)}</a> : (top.caption ?? "—").slice(0, 140)}</p>
          <p className="stat-vs">{NETWORK_LABEL[top.network] ?? top.network} · {pf.format(top.rate!)} {t("engagementLower")}</p>
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h2>{t("recommendations")}</h2>
          <Link className="btn small" href={links.recommend}>{t("askAgent")}</Link>
        </div>
        {recs.length ? (
          <>
            <p className="stat-vs">{t("fromAudit", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(audit!.createdAt)) })}</p>
            <ul className="plain recs">{recs.map((r, i) => <li key={i}><span className={`badge rec-${r.kind}`}>{t(`recKinds.${r.kind}`)}</span><span>{r.text}</span></li>)}</ul>
          </>
        ) : <p>{t("noAudit")} <Link href={links.audit}>{t("runAudit")}</Link></p>}
      </section>

      <div className="info-grid">
        <section className="card">
          <h2>{ta("strategy")}</h2>
          {strategy ? <p>{strategy.title} · {ta(`periods.${strategy.period}`)}</p> : <p className="stat-vs">{ta("noStrategy")}</p>}
          <Link className="btn small ghost" href={links.strategy}>{t("openStrategy")}</Link>
        </section>
        <section className="card">
          <h2>{t("waiting")}</h2>
          <p>{pendingSuggestions ? t("waitingCount", { count: pendingSuggestions }) : t("waitingNone")}</p>
          {pendingSuggestions > 0 && <Link className="btn small ghost" href={links.review}>{t("review")}</Link>}
        </section>
      </div>
    </div>
  );
}

/** Loads the data for InsightsView through the caller's own session (RLS applies). */
export async function InsightsPanel({ locale, clientId, links }: { locale: string; clientId?: string; links: Props["links"] }) {
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { sb, clientId: id } = access.actor;
  const [data, aud, strat, pending] = await Promise.all([
    loadAnalyticsData(sb, id),
    sb.from("audits").select("report, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(1),
    sb.from("strategies").select("title, period, content, created_at").eq("client_id", id).eq("active", true).maybeSingle(),
    sb.from("proposals").select("id", { count: "exact", head: true }).eq("client_id", id).eq("status", "pending"),
  ]);
  const audit = aud.data?.[0] ? { ...(aud.data[0].report as AuditReport), createdAt: aud.data[0].created_at as string } : null;
  const strategy = strat.data ? { title: strat.data.title, period: strat.data.period, createdAt: strat.data.created_at, content: strat.data.content as Record<string, unknown> } : null;
  return <InsightsView locale={locale} data={data} audit={audit} strategy={strategy} pendingSuggestions={pending.count ?? 0} links={links} />;
}
