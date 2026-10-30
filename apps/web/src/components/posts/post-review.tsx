import { getTranslations } from "next-intl/server";
import { reviewPost, timecode, FEED_CUT, type ReviewInput } from "@orbita/content";
import { CleanTextButton } from "./clean-text-button";
import { HumanizeRewrite } from "./humanize-rewrite";

const bar = (score: number) => <span className="review-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></span>;
const tone = (v: string) => (["STRONG", "PASS", "READY", "OK"].includes(v) ? "ok" : ["WEAK", "FLAGGED", "FIX"].includes(v) ? "bad" : "warn");

/** Staff-only quality check of a post: opening line, reel timing, caption as the feed shows it, and an "AI-sounding" check with a one-click cleaner. */
export async function PostReview({ postId, post }: { postId: string; post: ReviewInput }) {
  const t = await getTranslations("postReview");
  const r = reviewPost(post);
  if (!r.hooks.length && !r.beats && !r.caption && !r.ai) return null;
  return (
    <section className="card post-review" style={{ marginTop: "1.25rem" }}>
      <div className="section-head"><h2>{t("title")}</h2></div>
      <p className="stat-vs">{t("intro")}</p>
      {r.englishOnly && <p className="stat-vs">{t("englishOnly")}</p>}

      {r.hooks.length > 0 && (
        <div className="review-block">
          <h3>{t("hooks")}</h3>
          <ul className="plain">
            {r.hooks.map((h, i) => (
              <li key={i}>
                <p><span className={`badge review-${tone(h.verdict)}`}>{t(`verdict.${h.verdict}`)} · {t("hookScore", { score: h.score })}</span> {h.hook}</p>
                <p className="stat-vs">{h.formula ? t("formula", { name: h.formula.name }) : t("noFormula")}{i === 0 && h.verdict !== "STRONG" ? ` · ${t("weakest", { name: t(`checks.${h.weakest}`) })}` : ""}</p>
                {i === 0 && h.flags.map((f, j) => <p key={j} className="stat-vs">⚠ {f}</p>)}
                {i === 0 && <div className="review-checks">{(Object.keys(h.checks) as (keyof typeof h.checks)[]).map((k) => <span key={k}><small>{t(`checks.${k}`)}</small>{bar(h.checks[k].score)}</span>)}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.beats && (
        <div className="review-block">
          <h3>{t("beats")}</h3>
          <p className="stat-vs">{t("beatsSummary", { words: r.beats.totalWords, seconds: r.beats.totalSeconds.toFixed(1), wpm: r.beats.wpm })}{r.beats.target ? ` · ${t("beatsTarget", { target: r.beats.target })}` : ""}</p>
          <ol className="review-beats">
            {r.beats.beats.map((b) => <li key={b.n}><code>{timecode(b.start)}</code> <small>{b.dur.toFixed(1)}s</small> {b.label && <strong>{b.label}</strong>} {b.text}{b.flags.map((f, i) => <em key={i} className="review-flag"> ⚠ {f}</em>)}</li>)}
          </ol>
          <ul>{r.beats.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      {r.caption && (
        <div className="review-block">
          <h3>{t("caption")} <span className={`badge review-${tone(r.caption.verdict)}`}>{t(`captionVerdict.${r.caption.verdict}`)}</span></h3>
          <p className="stat-vs">{t("captionVisible")} (~{FEED_CUT})</p>
          <p className="feed-box pre">{r.caption.visible}{r.caption.truncated ? <span className="stat-vs"> {t("captionMore")}</span> : <span className="stat-vs"> {t("captionFits")}</span>}</p>
          <ul>{r.caption.checks.filter((c) => c.status !== "PASS").map((c, i) => <li key={i}><strong>{c.check}</strong>: {c.detail}</li>)}</ul>
        </div>
      )}

      {r.ai && (
        <div className="review-block">
          <h3>{t("ai")} <span className={`badge review-${tone(r.ai.verdict)}`}>{t(`aiVerdict.${r.ai.verdict}`)} · {t("aiScore", { score: r.ai.humanScore })}</span></h3>
          <div className="review-checks">{(Object.keys(r.ai.checks) as (keyof typeof r.ai.checks)[]).map((k) => <span key={k} title={r.ai!.checks[k].detail}><small>{t(`aiChecks.${k}`)}</small>{bar(r.ai!.checks[k].score)}</span>)}</div>
          <p className="stat-vs">{r.artefacts > 0 ? t("artefacts", { count: r.artefacts }) : t("nothingToClean")}</p>
          <CleanTextButton postId={postId} disabled={r.artefacts === 0} />
          {post.caption && r.ai.verdict !== "PASS" && <HumanizeRewrite postId={postId} caption={post.caption} />}
          <p className="stat-vs">{t("cleanNote")}</p>
        </div>
      )}
    </section>
  );
}
