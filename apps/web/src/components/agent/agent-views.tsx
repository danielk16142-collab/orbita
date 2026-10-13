import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ClientContext } from "@/lib/agent/context";
import { ProposalCard, type ProposalView } from "./proposal-card";

type StrategyContent = {
  objectives?: string[]; pillars?: { name: string; share_percent: number }[];
  cadence?: { network: string; posts_per_week: number; best_days: string[]; best_time: string }[]; topics?: string[];
};
const fmtDate = (iso: string, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));

/** The active content strategy for one client. Research and competitors have their own sections. */
export async function StrategyView({ locale, strategy, askHref }: {
  locale: string; strategy: ClientContext["strategy"]; askHref: (ask: string) => string;
}) {
  const t = await getTranslations("agent");
  const c = (strategy?.content ?? {}) as StrategyContent;
  return (
    <div className="stack">
      <section className="card">
        <div className="section-head">
          <h2>{t("strategy")}</h2>
          <Link className="btn small" href={askHref("strategy")}>{strategy ? t("asksButton.strategyUpdate") : t("asksButton.strategy")}</Link>
        </div>
        {strategy ? (
          <>
            <p className="stat-vs">{strategy.title} · {t(`periods.${strategy.period}`)} · {fmtDate(strategy.createdAt, locale)}</p>
            <div className="info-grid">
              {c.objectives?.length ? <div><h3>{t("objectives")}</h3><ul>{c.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></div> : null}
              {c.pillars?.length ? <div><h3>{t("pillars")}</h3><ul className="plain">{c.pillars.map((x, i) => (
                <li key={i} className="pillar"><span>{x.name}</span><span className="pillar-bar" aria-label={`${x.share_percent}%`}><span style={{ width: `${Math.min(100, Math.max(0, x.share_percent))}%` }} /></span><strong>{x.share_percent}%</strong></li>
              ))}</ul></div> : null}
              {c.cadence?.length ? <div><h3>{t("cadence")}</h3><ul>{c.cadence.map((x, i) => <li key={i}><strong>{x.network}</strong>: {x.posts_per_week}/{t("perWeek")} · {x.best_days.map((d) => t(`days.${d}`)).join(", ")} {x.best_time}</li>)}</ul></div> : null}
              {c.topics?.length ? <div><h3>{t("topics")}</h3><ul>{c.topics.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
            </div>
          </>
        ) : <p>{t("noStrategy")}</p>}
      </section>

    </div>
  );
}

/** The latest audit of the client's online presence (website and social accounts). */
export async function AuditView({ locale, audit, sources, askHref, profileHref }: {
  locale: string; audit: ClientContext["audit"]; sources: ClientContext["sources"]; askHref: (ask: string) => string; profileHref: string;
}) {
  const t = await getTranslations("agent");
  return (
    <div className="stack">
      <section className="card">
        <div className="section-head">
          <h2>{t("audit")}</h2>
          <Link className="btn small" href={askHref("audit")}>{audit ? t("asksButton.auditAgain") : t("asksButton.audit")}</Link>
        </div>
        {audit ? (
          <>
            <p className="stat-vs">{t("auditDate", { date: fmtDate(audit.createdAt, locale) })}</p>
            <p className="lead">{audit.summary}</p>
          </>
        ) : <p>{t("noAudit")}</p>}
        <p className="stat-vs">{t("auditCovers")} {sources.length ? sources.map((s) => s.url ?? `@${s.handle}`).join(" · ") : <Link href={profileHref}>{t("addLinksFirst")}</Link>}</p>
      </section>
      {audit && (
        <div className="info-grid three">
          {(["strengths", "weaknesses", "opportunities"] as const).map((k) => (
            <section key={k} className={`card audit-col ${k}`}>
              <h3>{t(`auditParts.${k}`)}</h3>
              {audit[k].length ? <ul>{audit[k].map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="stat-vs">—</p>}
            </section>
          ))}
        </div>
      )}
      {audit?.social_notes && <section className="card"><h3>{t("auditParts.social")}</h3><p>{audit.social_notes}</p></section>}
      {audit?.missing_info?.length ? <section className="card"><h3>{t("auditParts.missing")}</h3><ul>{audit.missing_info.map((x, i) => <li key={i}>{x}</li>)}</ul></section> : null}
    </div>
  );
}

/** Content the agent prepared (plans, posts, strategy) waiting for a person to accept, edit or reject. */
export async function ContentSuggestions({ proposals, clientId }: { proposals: ProposalView[]; clientId?: string }) {
  const t = await getTranslations("agent");
  return (
    <section className="card">
      <h2>{t("readyForReview")}</h2>
      {proposals.length ? proposals.map((p) => <ProposalCard key={p.id} clientId={clientId} proposal={p} />) : <p className="stat-vs">{t("noContentSuggestions")}</p>}
    </section>
  );
}

/** Small card linking chat to the profile: how complete the brand profile is and what it still needs. */
export async function ProfileNudge({ score, missing, pendingKnowledge, profileHref }: { score: number; missing: string[]; pendingKnowledge: number; profileHref: string }) {
  const t = await getTranslations("agent");
  return (
    <section className="card">
      <p className="eyebrow">{t("completeness")}</p>
      <div className="meter" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={t("completeness")}><span style={{ width: `${score}%` }} /></div>
      <p><strong>{score}%</strong>{missing.length > 0 && <> · {t("missing")}: {missing.slice(0, 3).map((m) => t(`sections.${m}`)).join(", ")}</>}</p>
      {pendingKnowledge > 0 && <p>{t("pendingKnowledge", { count: pendingKnowledge })}</p>}
      <Link className="btn small ghost" href={profileHref}>{t("openProfile")}</Link>
    </section>
  );
}
