import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Cadence } from "@/lib/cadence";
import { NETWORK_COLOR, NETWORK_LABEL } from "@/components/posts/shared";
import { GoalPicker } from "./goal-picker";
import { FillWeek, MoveButton } from "./fill-week";

/**
 * "Your next post": the soonest planned post, or a suggestion from the strategy, with one button to start it.
 * Beside it, this week's published posts against the goal and the streak of weeks that met it.
 */
export async function NextPostCard({ cadence, locale, clientId, postsBase, newPostHref, agentHref, network = "instagram", staff = false }: {
  cadence: Cadence; locale: string; clientId?: string; /** the network "Fill the week" plans for */ network?: string; /** staff can move missed posts */ staff?: boolean;
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
  const { ahead, missed, recap } = cadence;
  const pf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const moveTo = ahead.openDays.find((d) => d > cadence.today) ?? ahead.openDays[0];
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

      <div className="next-post-extra">
        {recap && (
          <p className="recap"><strong>{t("lastWeek")}</strong> {t("recapPosts", { count: recap.posts })}
            {recap.best && <> {t("recapBest")} {recap.best.permalink ? <a href={recap.best.permalink} target="_blank" rel="noopener noreferrer nofollow">“{recap.best.caption || t("untitled")}”</a> : `“${recap.best.caption || t("untitled")}”`} ({t("engagement", { rate: pf.format(recap.best.rate) })})</>}
          </p>
        )}
        {ahead.short > 0 && ahead.openDays.length > 0 && (
          <div className="gap-warning" role="status">
            <p><strong>{t("gapTitle", { planned: ahead.planned, goal: ahead.goal })}</strong> {t("gapText", { count: ahead.short })}</p>
            <FillWeek clientId={clientId} locale={locale} network={network} />
          </div>
        )}
        {missed.length > 0 && (
          <details className="missed">
            <summary><strong>{t("missedTitle", { count: missed.length })}</strong> <span className="stat-vs">{t("missedHint")}</span></summary>
            <ul className="plain">
              {missed.slice(0, 8).map((p) => (
                <li key={p.id} className="missed-item">
                  <span className="kickstart-when">{day(p.planned_date!)}</span>
                  <span className="kickstart-body"><Link href={`${postsBase}/${p.id}`}>{(p.idea || t("untitled")).split("\n")[0].slice(0, 90)}</Link></span>
                  {staff && moveTo && <MoveButton clientId={clientId} postId={p.id} date={moveTo} locale={locale} />}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
