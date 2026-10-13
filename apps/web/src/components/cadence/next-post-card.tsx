import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Cadence } from "@/lib/cadence";
import { NETWORK_COLOR, NETWORK_LABEL } from "@/components/posts/shared";
import { GoalPicker } from "./goal-picker";

/**
 * "Your next post": the soonest planned post, or a suggestion from the strategy, with one button to start it.
 * Beside it, this week's published posts against the goal and the streak of weeks that met it.
 */
export async function NextPostCard({ cadence, locale, clientId, postsBase, newPostHref, agentHref }: {
  cadence: Cadence; locale: string; clientId?: string;
  /** e.g. /en/posts */ postsBase: string; /** "Create post" with the client already chosen, e.g. /en/posts/new?client=… */ newPostHref: string; agentHref: string;
}) {
  const t = await getTranslations("cadence");
  const tp = await getTranslations("posts");
  const { next, week, hasStrategy } = cadence;
  const dayF = new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const day = (d: string) => dayF.format(new Date(`${d}T00:00:00Z`));
  const withParams = (href: string, q: Record<string, string>) => `${href}${href.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`;
  const format = (type: string) => (tp.has(`formatCards.${type}.title`) ? tp(`formatCards.${type}.title`) : type);
  const net = (n: string) => <span className="badge"><span className="net-dot small" style={{ background: NETWORK_COLOR[n] }} aria-hidden="true" />{NETWORK_LABEL[n] ?? n}</span>;
  const pct = Math.min(100, Math.round((week.done / week.goal) * 100));
  const met = week.done >= week.goal;

  return (
    <section className="card next-post" aria-labelledby="next-post-h">
      <div className="next-post-main">
        <p className="eyebrow" id="next-post-h">{t("title")}</p>
        {next.kind === "planned" && (
          <>
            <h2>{(next.post.idea || t("untitled")).slice(0, 120)}</h2>
            <p className="flow-summary"><span className="badge">{format(next.post.type)}</span>{net(next.post.network)}<span className="badge">{tp.has(`statuses.${next.post.status}`) ? tp(`statuses.${next.post.status}`) : next.post.status}</span></p>
            <p className="stat-vs">{t("plannedFor", { day: day(next.post.planned_date!) })}</p>
            <div className="btn-row"><Link className="btn" href={`${postsBase}/${next.post.id}`}>{t("openIt")}</Link><Link className="btn ghost" href={newPostHref}>{t("another")}</Link></div>
          </>
        )}
        {next.kind === "suggestion" && (
          <>
            <h2>{next.title}</h2>
            <p className="flow-summary"><span className="badge">{t(next.source === "strategy" ? "fromStrategy" : "fromResearch")}</span>{next.network && net(next.network)}</p>
            {next.why && <p>{next.why}</p>}
            <p className="stat-vs">{t("bestDay", { day: day(next.day) })}{next.bucket ? ` · ${t(`buckets.${next.bucket}`)}` : next.time ? ` · ${next.time}` : ""}</p>
            <div className="btn-row"><Link className="btn" href={withParams(newPostHref, { idea: next.title, date: next.day })}>{t("createIt")}</Link></div>
          </>
        )}
        {next.kind === "empty" && (
          <>
            <h2>{t("emptyTitle")}</h2>
            <p>{hasStrategy ? t("emptyWithStrategy") : t("emptyNoStrategy")}</p>
            <div className="btn-row"><Link className="btn" href={withParams(newPostHref, { date: next.day })}>{t("createPost")}</Link>{!hasStrategy && <Link className="btn ghost" href={agentHref}>{t("buildStrategy")}</Link>}</div>
          </>
        )}
      </div>

      <div className="next-post-week">
        <p className="eyebrow">{t("thisWeek")}</p>
        <p className="goal-count"><strong>{week.done}</strong> {t("ofGoal", { goal: week.goal })}</p>
        <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={week.goal} aria-valuenow={Math.min(week.done, week.goal)} aria-label={t("thisWeek")}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="stat-vs">{met ? t("goalMet") : t("toGo", { count: week.goal - week.done, days: week.daysLeft })}</p>
        {week.streak > 0 && <p className="streak">{t("streak", { count: week.streak })}</p>}
        {cadence.goalSaved && <GoalPicker clientId={clientId} goal={week.goal} />}
      </div>
    </section>
  );
}
