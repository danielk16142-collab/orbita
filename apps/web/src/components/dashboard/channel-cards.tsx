import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChannelAudit, type TikTokSummary } from "@orbita/agent";
import type { LinkedInSummary } from "@orbita/connectors";
import type { AgentActor } from "@/lib/agent/access";
import { latestChannelStats, tiktokHandle, type ChannelRow } from "@/lib/channel-stats";
import { ChannelAuditPanel, FetchTikTokButton, LinkedInUpload } from "./channel-widgets";

type Sb = AgentActor["sb"];
const parseAudit = (v: unknown) => { const r = v ? ChannelAudit.safeParse(v) : null; return r?.success ? r.data : null; };

/** TikTok and LinkedIn on Home: the latest numbers (fetched or uploaded), with an audit and recommendations. */
export async function ChannelCards({ sb, clientId, locale, staff, actorClientId, profileHref }: { sb: Sb; clientId: string; locale: string; staff: boolean; actorClientId?: string; profileHref: string }) {
  const [{ tiktok, linkedin, setUp }, handle] = await Promise.all([latestChannelStats(sb, clientId), tiktokHandle(sb, clientId)]);
  return <ChannelsView locale={locale} staff={staff} clientId={actorClientId} profileHref={profileHref} tiktok={tiktok} linkedin={linkedin} handle={handle} setUp={setUp} apify={!!process.env.APIFY_TOKEN} />;
}

export async function ChannelsView({ locale, staff, clientId, profileHref, tiktok, linkedin, handle, setUp, apify }: {
  locale: string; staff: boolean; clientId?: string; profileHref: string; tiktok: ChannelRow | null; linkedin: ChannelRow | null; handle: string | null; setUp: boolean; apify: boolean;
}) {
  const t = await getTranslations("channels");
  const nf = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const pf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const n = (x: number | null | undefined) => (x == null ? "—" : nf.format(x));
  const tk = tiktok?.summary as TikTokSummary | undefined;
  const li = linkedin?.summary as LinkedInSummary | undefined;
  return (
    <div className="channel-cards">
      {!setUp && <p className="stat-vs">{t("notSetUp")}</p>}

      <section className="card channel-card">
        <div className="section-head"><h2><span className="net-dot" style={{ background: "var(--series-2)" }} aria-hidden="true" /> TikTok{tiktok?.handle ? <span className="stat-vs"> @{tiktok.handle}</span> : null}</h2>
          {tiktok && <span className="stat-vs">{t("updated", { date: date.format(new Date(tiktok.created_at)) })}</span>}</div>
        {!tk && <p className="stat-vs">{handle ? t("tiktok.empty", { handle }) : t("tiktok.noHandle")}</p>}
        {!handle && <Link className="btn small ghost" href={profileHref}>{t("tiktok.addHandle")}</Link>}
        {tk && (<>
          <dl className="mini-stats">
            <div><dt>{t("tiktok.followers")}</dt><dd>{n(tk.followers)}{tk.followersDelta != null && tk.followersDelta !== 0 && <small> {tk.followersDelta > 0 ? "+" : ""}{nf.format(tk.followersDelta)}</small>}</dd></div>
            <div><dt>{t("tiktok.videos30")}</dt><dd>{tk.videos30}</dd></div>
            <div><dt>{t("tiktok.views30")}</dt><dd>{n(tk.views30)}</dd></div>
            <div><dt>{t("tiktok.avgViews")}</dt><dd>{n(tk.avgViews30)}</dd></div>
            <div><dt>{t("tiktok.engagement")}</dt><dd>{tk.engagementRate == null ? "—" : pf.format(tk.engagementRate)}</dd></div>
          </dl>
          {tk.top.length > 0 && <><h3>{t("tiktok.best")}</h3><ol className="channel-posts">{tk.top.map((v, i) => <li key={i}>{v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer nofollow">{v.hook || "—"}</a> : v.hook}<span className="stat-vs"> · {n(v.views)} {t("tiktok.views")}{v.postedAt ? ` · ${v.postedAt}` : ""}</span></li>)}</ol></>}
        </>)}
        <div className="btn-row">
          {staff && handle && apify && setUp && <FetchTikTokButton clientId={clientId} again={!!tk} />}
        </div>
        {tiktok && <ChannelAuditPanel clientId={clientId} statsId={tiktok.id} locale={locale} initial={parseAudit(tiktok.audit)} auditedAt={tiktok.audited_at} />}
      </section>

      <section className="card channel-card">
        <div className="section-head"><h2><span className="net-dot" style={{ background: "var(--series-3)" }} aria-hidden="true" /> LinkedIn</h2>
          {linkedin && <span className="stat-vs">{li?.period.from && li.period.to ? t("linkedin.period", { from: li.period.from, to: li.period.to }) : t("updated", { date: date.format(new Date(linkedin.created_at)) })}</span>}</div>
        {!li && <p className="stat-vs">{t("linkedin.empty")}</p>}
        {li && (<>
          <dl className="mini-stats">
            <div><dt>{t("linkedin.impressions")}</dt><dd>{n(li.impressions)}</dd></div>
            <div><dt>{t("linkedin.reached")}</dt><dd>{n(li.membersReached)}</dd></div>
            <div><dt>{t("linkedin.engagement")}</dt><dd>{li.engagementRate == null ? "—" : pf.format(li.engagementRate)}</dd></div>
            <div><dt>{t("linkedin.followers")}</dt><dd>{n(li.followers)}{li.newFollowers ? <small> +{nf.format(li.newFollowers)}</small> : null}</dd></div>
          </dl>
          {li.topPosts.length > 0 && <><h3>{t("linkedin.best")}</h3><ol className="channel-posts">{li.topPosts.slice(0, 3).map((p, i) => <li key={i}><a href={p.url} target="_blank" rel="noopener noreferrer nofollow">{p.date ?? t("linkedin.post")}</a><span className="stat-vs"> · {n(p.impressions)} {t("linkedin.impr")}{p.engagements != null ? ` · ${n(p.engagements)} ${t("linkedin.eng")}` : ""}</span></li>)}</ol></>}
          {li.demographics.length > 0 && <p className="stat-vs">{t("linkedin.audience")}: {li.demographics.slice(0, 4).map((d) => `${d.value}${d.share != null ? ` ${Math.round(d.share * 100)}%` : ""}`).join(" · ")}</p>}
        </>)}
        <details className="channel-howto"><summary>{t("linkedin.howTo")}</summary><ol><li>{t("linkedin.step1")}</li><li>{t("linkedin.step2")}</li><li>{t("linkedin.step3")}</li></ol></details>
        {setUp && <LinkedInUpload clientId={clientId} again={!!li} />}
        {linkedin && <ChannelAuditPanel clientId={clientId} statsId={linkedin.id} locale={locale} initial={parseAudit(linkedin.audit)} auditedAt={linkedin.audited_at} />}
      </section>
    </div>
  );
}
