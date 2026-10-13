"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Idea = { title: string; hook: string; why: string; source: string };

/** Ideas for the chosen format and networks, grounded in the client's strategy, latest plan and research. Clicking one fills the idea. */
export function PostIdeas({ clientId, format, networks, locale, onPick, picked }: {
  clientId?: string; format: string; networks: string[]; locale: string; onPick: (text: string) => void; picked: string;
}) {
  const t = useTranslations("posts");
  const [state, setState] = useState<{ loading: boolean; ideas: Idea[]; generated: boolean; hasStrategy: boolean; failed: boolean }>({ loading: true, ideas: [], generated: false, hasStrategy: true, failed: false });
  const [round, setRound] = useState(0);
  const key = `${clientId}|${format}|${networks.join(",")}|${round}`;
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, failed: false }));
    fetch("/api/posts/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, format, networks, locale }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setState({ loading: false, ideas: d.ideas ?? [], generated: !!d.generated, hasStrategy: d.hasStrategy !== false, failed: false }); })
      .catch(() => { if (live) setState((s) => ({ ...s, loading: false, failed: true })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const text = (i: Idea) => (i.hook ? `${i.title}\n${t("ideas.hookLabel")} ${i.hook}` : i.title);
  return (
    <section className="post-ideas" aria-labelledby="h-ideas" aria-busy={state.loading}>
      <div className="section-head">
        <h3 id="h-ideas">{t("ideas.title")}</h3>
        {!state.loading && <button type="button" className="btn ghost small" onClick={() => setRound((r) => r + 1)}>{t("ideas.more")}</button>}
      </div>
      <p className="stat-vs">{state.loading ? t("ideas.loading") : state.generated ? t("ideas.fromAgent") : t("ideas.fromStrategy")}</p>
      {state.loading && <ul className="plain idea-cards">{[0, 1, 2].map((i) => <li key={i} className="idea-card skeleton" aria-hidden="true" />)}</ul>}
      {!state.loading && state.failed && <p className="stat-vs">{t("ideas.failed")}</p>}
      {!state.loading && !state.failed && state.ideas.length === 0 && <p className="stat-vs">{state.hasStrategy ? t("ideas.none") : t("ideas.noStrategy")}</p>}
      {!state.loading && state.ideas.length > 0 && (
        <ul className="plain idea-cards">
          {state.ideas.map((i, n) => (
            <li key={n}>
              <button type="button" className="idea-card" aria-pressed={picked === text(i)} onClick={() => onPick(text(i))}>
                <span className="badge">{t(`ideas.sources.${i.source}`)}</span>
                <strong>{i.title}</strong>
                {i.hook && <span className="idea-hook">“{i.hook}”</span>}
                {i.why && <span className="stat-vs">{i.why}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
