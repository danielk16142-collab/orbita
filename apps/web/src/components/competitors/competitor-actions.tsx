"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { COMPETITOR_NETWORKS } from "@/lib/competitors";
import { analysisToResearchAction, removeCompetitorAction, saveCompetitorAction } from "@/lib/research-actions";
import { createPostAction } from "@/lib/posts-actions";

const LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", facebook: "Facebook" };
type Initial = { id: string; name: string; website: string; notes: string; links: Record<string, string> };

/** Add a competitor (then open its page) or edit one in place. */
export function CompetitorForm({ clientId, initial, detailBase, onCancelLabel }: { clientId?: string; initial?: Initial; detailBase: string; onCancelLabel?: string }) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [open, setOpen] = useState(!!initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>+ {t("add")}</button>;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const d = new FormData(e.currentTarget);
    const links = Object.fromEntries(COMPETITOR_NETWORKS.map((n) => [n, String(d.get(n) ?? "")]));
    start(async () => {
      const r = await saveCompetitorAction({ clientId, id: initial?.id, name: d.get("name"), website: d.get("website"), notes: d.get("notes"), links });
      if (!r.ok) { setError(r.error.startsWith("link_") ? t("errors.link", { network: LABEL[r.error.slice(5)] ?? r.error.slice(5) }) : t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic")); return; }
      if (initial) router.refresh(); else router.push(`${detailBase}/${r.id}`);
    });
  }
  return (
    <form onSubmit={submit} className="card competitor-form">
      <h2>{initial ? t("edit") : t("add")}</h2>
      <label>{t("name")}<input name="name" required maxLength={120} defaultValue={initial?.name} /></label>
      <label>{t("website")}<input name="website" type="url" maxLength={300} placeholder="https://" defaultValue={initial?.website} /></label>
      <div className="link-grid">
        {COMPETITOR_NETWORKS.map((n) => <label key={n}>{LABEL[n]}<input name={n} maxLength={300} placeholder={t("linkPlaceholder")} defaultValue={initial?.links[n] ?? ""} /></label>)}
      </div>
      <label>{t("notes")}<textarea name="notes" rows={2} maxLength={1000} placeholder={t("notesPlaceholder")} defaultValue={initial?.notes} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="btn-row">
        <button className="btn" disabled={pending}>{t("saveProfile")}</button>
        {!initial && <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{onCancelLabel ?? t("cancel")}</button>}
      </div>
    </form>
  );
}

/** Runs (or re-runs) the analysis. It takes a minute or two: show the time so the person knows it is working. */
export function AnalyzeButton({ clientId, competitorId, locale, again }: { clientId?: string; competitorId: string; locale: string; again: boolean }) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!busy) return; setSeconds(0); const i = setInterval(() => setSeconds((s) => s + 1), 1000); return () => clearInterval(i); }, [busy]);
  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/competitors/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, competitorId, locale }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(t.has(`errors.${data.error}`) ? t(`errors.${data.error}`) : t("errors.generic")); else router.refresh();
    } catch { setError(t("errors.generic")); }
    finally { setBusy(false); }
  }
  return (
    <div className="analyze">
      <button type="button" className="btn" onClick={run} disabled={busy}>{busy ? t("analyzing") : again ? t("analyzeAgain") : t("analyze")}</button>
      {busy && <span className="stat-vs" role="status">{t("wait", { seconds })}</span>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function RemoveCompetitorButton({ clientId, id, listHref }: { clientId?: string; id: string; listHref: string }) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="btn ghost small" disabled={pending} onClick={() => { if (confirm(t("removeConfirm"))) start(async () => { const r = await removeCompetitorAction({ clientId, id }); if (r.ok) router.push(listHref); }); }}>{t("remove")}</button>;
}

type Idea = { title: string; format: string; network: string; why: string };

/** Pick content ideas from the analysis and add them to the calendar as ideas (one post each, unscheduled). */
export function IdeasPicker({ clientId, ideas, locale, calendarHref }: { clientId?: string; ideas: Idea[]; locale: string; calendarHref: string }) {
  const t = useTranslations("competitors");
  const tp = useTranslations("posts");
  const [picked, setPicked] = useState<number[]>([]);
  const [added, setAdded] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const add = () => start(async () => {
    setError(null);
    for (const i of picked) {
      const idea = ideas[i];
      const r = await createPostAction({ clientId, network: idea.network, language: ["en", "fr", "es"].includes(locale) ? locale : "en", type: idea.format, idea: [idea.title, idea.why].filter(Boolean).join(". ").slice(0, 2000), status: "idea" });
      if (!r.ok) { setError(t("errors.ideas")); return; }
      setAdded((a) => [...a, i]);
    }
    setPicked([]);
  });
  return (
    <div>
      <ul className="plain idea-list">
        {ideas.map((idea, i) => (
          <li key={i}>
            <label className="idea">
              <input type="checkbox" checked={picked.includes(i) || added.includes(i)} disabled={added.includes(i)} onChange={() => toggle(i)} />
              <span><strong>{idea.title}</strong> <span className="badge">{tp.has(`formats.${idea.format}`) ? tp(`formats.${idea.format}`) : idea.format}</span> <span className="badge">{LABEL[idea.network] ?? idea.network}</span>{idea.why && <span className="stat-vs block">{idea.why}</span>}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="btn-row">
        <button type="button" className="btn small" disabled={pending || picked.length === 0} onClick={add}>{t("addIdeas", { count: picked.length })}</button>
        {added.length > 0 && <a className="btn small ghost" href={calendarHref}>✓ {t("ideasAdded", { count: added.length })}</a>}
      </div>
    </div>
  );
}

/** Saves the analysis as research (so the agent reads it) and opens the chat with a request to update the strategy. */
export function UseInStrategyButton({ clientId, analysisId, chatHref }: { clientId?: string; analysisId: string; chatHref: string }) {
  const t = useTranslations("competitors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <div className="btn-row">
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { const r = await analysisToResearchAction({ clientId, analysisId }); if (r.ok) router.push(chatHref); })}>{t("useInStrategy")}</button>
      <button type="button" className="btn ghost" disabled={pending || saved} onClick={() => start(async () => { const r = await analysisToResearchAction({ clientId, analysisId }); if (r.ok) setSaved(true); })}>{saved ? `✓ ${t("savedToResearch")}` : t("saveToResearch")}</button>
    </div>
  );
}
