import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { compact, rankWins, topFormulas, type RankedWin } from "@orbita/content";
import { RemoveWinButton } from "./wins";

export type WinRow = { id: string; competitor_id: string; hook: string; url: string | null; network: string; views: number | null; likes: number | null; comments: number | null; shares: number | null; followers: number | null; posted_at: string | null; formula_id: number | null; caption?: string | null };
export const WIN_COLS = "id, competitor_id, hook, url, network, views, likes, comments, shares, followers, posted_at, formula_id";
export const toWin = (r: WinRow) => ({ id: r.id, competitorId: r.competitor_id, hook: r.hook, url: r.url, views: r.views, likes: r.likes, comments: r.comments, shares: r.shares, followers: r.followers, postedAt: r.posted_at, formulaId: r.formula_id });

/** Recorded winning posts, best first: how many times the competitor's own median each one reached, and the hook formula behind it. */
export async function WinsList({ rows, names, clientId, staff, winChat, showTop = true, limit }: {
  rows: WinRow[]; names: Record<string, string>; clientId?: string; staff: boolean; winChat?: (idea: string) => string; showTop?: boolean; limit?: number;
}) {
  const t = await getTranslations("wins");
  const ranked: RankedWin[] = rankWins(rows.map(toWin));
  if (!ranked.length) return <p className="empty-note">{t("empty")}</p>;
  const top = showTop ? topFormulas(ranked) : [];
  const shown = limit ? ranked.slice(0, limit) : ranked;
  return (
    <div className="stack">
      {top.length > 0 && <p className="stat-vs">{t("topFormulas")}: {top.map((f) => `${f.name} ×${f.uses}`).join(" · ")}</p>}
      <ol className="plain wins">
        {shown.map((w) => (
          <li key={w.id} className="card win">
            <div className="win-head">
              <strong className="win-multiple">{w.multiple ? `${w.multiple}×` : compact(w.value)}</strong>
              <span className="stat-vs">{w.multiple ? t("ofMedian", { median: compact(w.baseline ?? 0), metric: t(`metric.${w.metric}`) }) : t("noBaseline", { metric: t(`metric.${w.metric}`) })}</span>
              {w.formula && <span className="badge">{w.formula.name}</span>}
              {names[w.competitorId] && <span className="badge">{names[w.competitorId]}</span>}
            </div>
            <p className="win-hook">“{w.hook}”</p>
            <p className="stat-vs">
              {[w.views != null && `${compact(w.views)} ${t("views")}`, w.likes != null && `${compact(w.likes)} ${t("likes")}`, w.comments != null && `${compact(w.comments)} ${t("comments")}`, w.postedAt].filter(Boolean).join(" · ")}
              {w.url && <> · <a href={w.url} target="_blank" rel="noopener noreferrer nofollow">{t("open")}</a></>}
            </p>
            <div className="btn-row">
              {winChat && <Link className="btn small" href={winChat(`${w.hook} ‖ ${w.formula?.name ?? ""}`)}>{t("makeOurs")}</Link>}
              {staff && <RemoveWinButton clientId={clientId} id={w.id} />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
