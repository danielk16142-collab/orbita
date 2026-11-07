"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { LinkedInProfileInput, ProfileScore } from "@orbita/agent";

type Rewrites = { headline_options: string[]; about_open: string; about_body: string; current_role: string; featured: string[]; banner: string; top_skills: string[] };
type Result = { score: ProfileScore; rewrites: Rewrites; stillNeeds: string[] };
const EMPTY: LinkedInProfileInput = { headline: "", about: "", currentRole: "", pastRoles: "", featured: "", banner: "", topSkills: "", photo: "none", activity: "never", recommendations: 0, recommendationsNameOutcomes: false, customUrl: false, contactLink: false, sameHandle: false };
const LANGS = ["en", "fr", "es"];

/** Remembered on this device only (the profile text is not stored by Orbita). */
const storeKey = (clientId?: string) => `orbita:li-profile:${clientId ?? "me"}`;
const load = (k: string): { input: LinkedInProfileInput; result: Result | null } | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

function Copy({ text }: { text: string }) {
  const t = useTranslations("liProfile");
  const [done, setDone] = useState(false);
  return <button type="button" className="btn ghost small" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? t("copied") : t("copy")}</button>;
}

/**
 * LinkedIn profile score (li-profile, 12 items, 100 points): paste the profile, answer a few questions, get the score table,
 * rewrites in fix-first order, and the honest score after the rewrites. Nothing is posted to LinkedIn.
 */
export function LinkedInScore({ clientId, locale }: { clientId?: string; locale: string }) {
  const t = useTranslations("liProfile");
  const ta = useTranslations("agent");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<LinkedInProfileInput>(EMPTY);
  const [language, setLanguage] = useState(LANGS.includes(locale) ? locale : "en");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const s = load(storeKey(clientId)); if (s) { setInput({ ...EMPTY, ...s.input }); setResult(s.result); } }, [clientId]);
  const set = <K extends keyof LinkedInProfileInput>(k: K, v: LinkedInProfileInput[K]) => setInput((x) => ({ ...x, [k]: v }));

  async function score() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/linkedin/profile-score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, locale, language, profile: input }) });
      const data = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok || !data.score) { const c = data.error ?? "generic"; setError(t.has(`errors.${c}`) ? t(`errors.${c}`) : ta.has(`errors.${c}`) ? ta(`errors.${c}`) : ta("errors.generic")); return; }
      const r = data as Result;
      setResult(r); save(storeKey(clientId), { input, result: r });
    } catch { setError(ta("errors.generic")); }
    finally { setBusy(false); }
  }

  const lost = result ? [...result.score.items].filter((i) => i.score < i.points).sort((a, b) => (b.points - b.score) - (a.points - a.score)) : [];
  const ta2 = (k: keyof LinkedInProfileInput, rows: number, max: number) => (
    <label>{t(`fields.${k}`)}<textarea rows={rows} maxLength={max} value={String(input[k])} onChange={(e) => set(k, e.target.value as never)} placeholder={t.has(`hints.${k}`) ? t(`hints.${k}`) : undefined} /></label>
  );
  return (
    <section className="card li-score" aria-labelledby="li-score-h">
      <div className="section-head">
        <h2 id="li-score-h">{t("title")}</h2>
        {result && <strong className="li-total">{t("total", { score: result.score.total })}</strong>}
      </div>
      <p className="stat-vs">{t("intro")}</p>
      {!open && <button type="button" className="btn small" onClick={() => setOpen(true)}>{result ? t("again") : t("start")}</button>}

      {open && (
        <div className="li-form">
          <label>{t("fields.headline")} <small className="stat-vs">{input.headline.length}/220</small>
            <input value={input.headline} maxLength={400} onChange={(e) => set("headline", e.target.value)} placeholder={t("hints.headline")} />
          </label>
          {ta2("about", 6, 3000)}
          {ta2("currentRole", 4, 3000)}
          {ta2("pastRoles", 4, 4000)}
          {ta2("featured", 2, 1000)}
          <label>{t("fields.banner")}<input value={input.banner} maxLength={300} onChange={(e) => set("banner", e.target.value)} placeholder={t("hints.banner")} /></label>
          <label>{t("fields.topSkills")}<input value={input.topSkills} maxLength={300} onChange={(e) => set("topSkills", e.target.value)} placeholder={t("hints.topSkills")} /></label>
          <div className="plan-row li-answers">
            <label>{t("fields.photo")}<select value={input.photo} onChange={(e) => set("photo", e.target.value as LinkedInProfileInput["photo"])}>{(["recent_face", "old_face", "logo_or_other", "none"] as const).map((v) => <option key={v} value={v}>{t(`photo.${v}`)}</option>)}</select></label>
            <label>{t("fields.activity")}<select value={input.activity} onChange={(e) => set("activity", e.target.value as LinkedInProfileInput["activity"])}>{(["7d", "30d", "older", "never"] as const).map((v) => <option key={v} value={v}>{t(`activity.${v}`)}</option>)}</select></label>
            <label>{t("fields.recommendations")}<input type="number" min={0} max={100} value={input.recommendations} onChange={(e) => set("recommendations", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} /></label>
          </div>
          <div className="li-checks">
            {(["recommendationsNameOutcomes", "customUrl", "contactLink", "sameHandle"] as const).map((k) => (
              <label key={k} className="check-line"><input type="checkbox" checked={input[k]} onChange={(e) => set(k, e.target.checked)} /> <span>{t(`fields.${k}`)}</span></label>
            ))}
          </div>
          <div className="btn-row">
            <label className="li-lang">{t("language")}<select value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select></label>
            <button type="button" className="btn" onClick={score} disabled={busy || !(input.headline || input.about || input.currentRole)}>{busy ? t("scoring") : t("score")}</button>
            <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>{t("close")}</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}

      {result && (
        <div className="li-result">
          <table className="prose-table li-table">
            <thead><tr><th>{t("item")}</th><th>{t("points")}</th><th>{t("why")}</th></tr></thead>
            <tbody>{result.score.items.map((i) => (
              <tr key={i.id} className={i.score === i.points ? "full" : ""}>
                <td>{t(`items.${i.id}`)}</td><td className="num">{i.score}/{i.points}</td><td>{i.from === "answers" ? t("fromAnswers") : i.why}</td>
              </tr>))}</tbody>
          </table>
          <p className="stat-vs">{t("projected", { score: result.score.projectedTotal, delta: result.score.projectedTotal - result.score.total })}</p>

          <h3>{t("fixFirst")}</h3>
          <ol className="plain li-fixes">
            {lost.filter((i) => i.from === "rubric").map((i) => {
              const r = result.rewrites;
              const block = i.id === "headline" ? r.headline_options.join("\n\n") : i.id === "about_open" ? r.about_open : i.id === "about_body" ? `${r.about_open}\n\n${r.about_body}` : i.id === "current_role" || i.id === "experience_depth" ? r.current_role
                : i.id === "featured" ? r.featured.map((f, n) => `${n + 1}. ${f}`).join("\n") : i.id === "banner" ? r.banner : r.top_skills.join(", ");
              if (!block.trim()) return null;
              return (
                <li key={i.id} className="li-fix">
                  <div className="section-head"><strong>{t(`items.${i.id}`)} <span className="stat-vs">{t("lostPoints", { n: i.points - i.score })}</span></strong><Copy text={block} /></div>
                  <p className="remake-text">{block}</p>
                </li>
              );
            })}
          </ol>
          {result.stillNeeds.length > 0 && <><h3>{t("stillNeeds")}</h3><ul>{result.stillNeeds.map((s, n) => <li key={n}>{s}</li>)}</ul></>}
          <p className="stat-vs">{t("note")}</p>
        </div>
      )}
    </section>
  );
}
