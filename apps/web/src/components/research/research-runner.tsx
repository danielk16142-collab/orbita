"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { rememberFindingAction, saveFindingAction } from "@/lib/research-actions";

type Finding = { kind: string; title: string; summary: string; why_it_matters: string; sources: { title: string; url: string }[] };
type Done = Record<number, { saved?: boolean; remembered?: boolean }>;

/** Ask a research question; the findings come back on this page and the person picks what to save or remember. */
export function ResearchRunner({ locale, clientId }: { locale: string; clientId?: string }) {
  const t = useTranslations("research");
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ question: string; findings: Finding[]; note: string; searchFailed: boolean } | null>(null);
  const [done, setDone] = useState<Done>({});
  const [pending, start] = useTransition();
  useEffect(() => { if (!busy) return; setSeconds(0); const i = setInterval(() => setSeconds((s) => s + 1), 1000); return () => clearInterval(i); }, [busy]);

  async function run(q: string) {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    setBusy(true); setError(null); setResult(null); setDone({});
    try {
      const res = await fetch("/api/research/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, question: text, locale }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(t.has(`errors.${data.error}`) ? t(`errors.${data.error}`) : t("errors.generic"));
      else setResult({ question: text, ...data });
    } catch { setError(t("errors.generic")); }
    finally { setBusy(false); }
  }
  const mark = (i: number, k: "saved" | "remembered") => setDone((d) => ({ ...d, [i]: { ...d[i], [k]: true } }));
  const save = (i: number) => start(async () => {
    const f = result!.findings[i];
    const r = await saveFindingAction({ clientId, note: { kind: f.kind, title: f.title, summary: [f.summary, f.why_it_matters].filter(Boolean).join("\n\n").slice(0, 2000), sources: f.sources } });
    if (r.ok) { mark(i, "saved"); router.refresh(); } else setError(t(r.error === "not_set_up" ? "errors.not_set_up" : "errors.saveFailed"));
  });
  const remember = (i: number) => start(async () => {
    const f = result!.findings[i];
    const r = await rememberFindingAction({ clientId, content: `${f.title}: ${f.summary}`.slice(0, 1000) });
    if (r.ok) mark(i, "remembered"); else setError(t(r.error === "not_set_up" ? "errors.not_set_up" : "errors.saveFailed"));
  });
  const saveAll = () => result!.findings.forEach((_, i) => { if (!done[i]?.saved) save(i); });

  const starters = [t("starters.questions"), t("starters.trends"), t("starters.formats"), t("starters.dates")];
  return (
    <div className="stack">
      <form className="card research-form" onSubmit={(e) => { e.preventDefault(); void run(question); }}>
        <label htmlFor="research-q">{t("askLabel")}</label>
        <textarea id="research-q" rows={3} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("placeholder")} disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void run(question); } }} />
        <div className="btn-row">
          <button className="btn" disabled={busy || question.trim().length < 3}>{busy ? t("running") : t("run")}</button>
          {busy && <span className="stat-vs" role="status">{t("wait", { seconds })}</span>}
        </div>
        {!busy && !result && (
          <div className="starter-chips">
            <span className="stat-vs">{t("tryOne")}</span>
            {starters.map((s) => <button key={s} type="button" className="btn ghost small" onClick={() => { setQuestion(s); void run(s); }}>{s}</button>)}
          </div>
        )}
      </form>

      {error && <p className="error card" role="alert">{error}</p>}

      {result && (
        <section className="card" aria-live="polite">
          <div className="section-head">
            <h2>{t("resultsTitle")}</h2>
            {result.findings.length > 1 && <button type="button" className="btn small ghost" onClick={saveAll} disabled={pending}>{t("saveAll")}</button>}
          </div>
          <p className="stat-vs">{t("resultsFor", { question: result.question })}</p>
          {result.searchFailed && <p className="error">{t("errors.search_failed")}</p>}
          {result.findings.length === 0 && !result.searchFailed && <p>{t("nothingFound")}</p>}
          <ul className="plain findings">
            {result.findings.map((f, i) => (
              <li key={i} className="finding">
                <div className="finding-head"><span className="badge">{t(`kinds.${f.kind}`)}</span><strong>{f.title}</strong></div>
                <p>{f.summary}</p>
                {f.why_it_matters && <p className="why"><strong>{t("whyItMatters")}</strong> {f.why_it_matters}</p>}
                {f.sources.length > 0 && <p className="sources">{f.sources.map((s, j) => <a key={j} href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title || new URL(s.url).hostname}</a>)}</p>}
                <div className="btn-row">
                  <button type="button" className="btn small" onClick={() => save(i)} disabled={pending || done[i]?.saved}>{done[i]?.saved ? `✓ ${t("saved")}` : t("save")}</button>
                  <button type="button" className="btn small ghost" onClick={() => remember(i)} disabled={pending || done[i]?.remembered}>{done[i]?.remembered ? `✓ ${t("remembered")}` : t("remember")}</button>
                </div>
              </li>
            ))}
          </ul>
          {result.note && <p className="stat-vs note">{t("limits")} {result.note}</p>}
          <small>{t("saveHint")}</small>
        </section>
      )}
    </div>
  );
}
