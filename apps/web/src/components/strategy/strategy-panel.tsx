import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { focusFromRow } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadStrategyMap } from "@/lib/strategy-map";
import { localDay } from "@/lib/cadence";
import { StrategyView } from "@/components/agent/agent-views";
import type { ClientContext } from "@/lib/agent/context";
import { StrategyMap } from "./strategy-map";
import { StrategyMindMap } from "./strategy-mind-map";
import { ArchiveStrategyButton } from "./archive-strategy";
import { StrategyChat } from "./strategy-chat";

const shiftMonth = (month: string, n: number) => { const d = new Date(Date.parse(`${month}-01T00:00:00Z`)); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

/**
 * The Strategy section: the active strategy as a mind map or a calendar map, with ways to change it (through the agent,
 * or by editing the brand's topics and pillars) or to archive it and start over. Used by the agency and the portal.
 */
export async function StrategyPanel({ locale, clientId, query, hrefFor, agentAskHref, profileHref }: {
  locale: string; clientId?: string; query: { month?: string; layout?: string };
  /** This section with other params (layout, month). */ hrefFor: (extra: Record<string, string>) => string;
  /** The agent chat with the strategy request prepared. */ agentAskHref: string;
  /** The Profile, where topics and pillars are chosen. */ profileHref: string;
}) {
  const t = await getTranslations("strategyPage");
  const ta = await getTranslations("agent");
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { actor } = access;
  const cid = actor.profile.role === "client" ? undefined : actor.clientId;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? query.month! : localDay(actor.client.timezone ?? "UTC").slice(0, 7);
  const layout = query.layout === "calendar" ? "calendar" : "mind";
  const [data, { data: briefRow }] = await Promise.all([
    loadStrategyMap(actor, month),
    actor.sb.from("brand_briefs").select("*").eq("client_id", actor.clientId).maybeSingle(),
  ]);
  const focus = focusFromRow(briefRow as Record<string, unknown> | null);
  const postsBase = cid ? `/${locale}/posts` : `/${locale}/portal/posts`;
  const newPostHref = cid ? `${postsBase}/new?client=${cid}` : `${postsBase}/new`;
  const dateF = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  if (!data.strategy) {
    const chosen = focus.pillars.length > 0;
    return (
      <div className="strategy-section">
      <section className="card strategy-empty">
        <h2>{t("emptyTitle")}</h2>
        <p>{t("emptyText")}</p>
        <ol className="strategy-steps">
          <li className={chosen ? "done" : ""}><strong>{t("step1")}</strong> <span className="stat-vs">{chosen ? t("step1Done", { count: focus.pillars.length, topics: focus.topics.filter((x) => x.level !== "avoid").length }) : t("step1Hint")}</span> <Link href={profileHref}>{chosen ? t("edit") : t("choose")}</Link></li>
          <li><strong>{t("step2")}</strong> <span className="stat-vs">{t("step2Hint")}</span></li>
        </ol>
        <Link className="btn" href={agentAskHref}>{t("build")}</Link>
      </section>
      <StrategyChat clientId={cid} locale={locale} hasStrategy={false} />
      </div>
    );
  }

  return (
    <div className="strategy-section">
      <section className="card strategy-head">
        <div>
          <p className="eyebrow">{ta(`periods.${data.strategy.period}`)} · {dateF.format(new Date(data.strategy.createdAt))}</p>
          <h2>{data.strategy.title}</h2>
          {focus.topics.length > 0 && (
            <p className="strategy-topics">
              {focus.topics.filter((x) => x.level !== "avoid").map((x) => <span key={x.name} className={`badge level-${x.level}`}>{x.name}</span>)}
              {focus.topics.some((x) => x.level === "avoid") && <span className="stat-vs"> · {t("avoiding", { list: focus.topics.filter((x) => x.level === "avoid").map((x) => x.name).join(", ") })}</span>}
            </p>
          )}
        </div>
        <div className="btn-row strategy-actions">
          <Link className="btn small" href={agentAskHref}>{t("change")}</Link>
          <Link className="btn small ghost" href={profileHref}>{t("editFocus")}</Link>
          <ArchiveStrategyButton clientId={cid} />
        </div>
      </section>

      <StrategyChat clientId={cid} locale={locale} hasStrategy />

      <nav className="map-views" aria-label={ta("strategyViews")}>
        <Link className="btn small ghost" aria-current={layout === "mind" ? "page" : undefined} href={hrefFor({ layout: "mind", month })}>{ta("mindMap")}</Link>
        <Link className="btn small ghost" aria-current={layout === "calendar" ? "page" : undefined} href={hrefFor({ layout: "calendar", month })}>{ta("calendarMap")}</Link>
      </nav>
      {layout === "mind"
        ? <StrategyMindMap data={data} locale={locale} clientId={cid} postsBase={postsBase} newPostHref={newPostHref} />
        : <StrategyMap data={data} locale={locale} clientId={cid} postsBase={postsBase} newPostHref={newPostHref}
            prevMonthHref={hrefFor({ month: shiftMonth(month, -1), layout: "calendar" })} nextMonthHref={hrefFor({ month: shiftMonth(month, 1), layout: "calendar" })} askStrategyHref={agentAskHref} />}
      <details className="card map-details">
        <summary><strong>{ta("strategyDetails")}</strong></summary>
        <StrategyView locale={locale} strategy={data.strategy as ClientContext["strategy"]} askHref={() => agentAskHref} />
      </details>
    </div>
  );
}
