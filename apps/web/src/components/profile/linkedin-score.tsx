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
const load = (k: string): { input: LinkedInProfileInput; result: Result | null; link?: string } | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
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
export function LinkedInScore({ clientId, locale, linkedinUrl }: { clientId?: string; locale: string; /** a saved personal profile link (linkedin.com/in/...) */ linkedinUrl?: string }) {
  const t = useTranslations("liProfile");
  const ta = useTranslations("agent");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<LinkedInProfileInput>(EMPTY);
  const [language, setLanguage] = useState(LANGS.includes(locale) ? locale : "en");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"reading" | "scoring" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState(linkedinUrl ?? "");
  const [guessed, setGuessed] = useState<string[]>([]);
  const [readName, setReadName] = useState<string | null>(null);
  useEffect(() => { const s = load(storeKey(clientId)); if (s) { setInput({ ...EMPTY, ...s.input }); setResult(s.result); if (s.link) setLink(s.link); } }, [clientId]);
  const set = <K extends keyof LinkedInProfileInput>(k: K, v: LinkedInProfileInput[K]) => { setInput((x) => ({ ...x, [k]: v })); setGuessed((g) => g.filter((x) => x !== k)); };
  const errorText = (c: string) => (t.has(`errors.${c}`) ? t(`errors.${c}`) : ta.has(`errors.${c}`) ? ta(`errors.${c}`) : ta("errors.generic"));

  async function score(profile: LinkedInProfileInput = input) {
    setBusy("scoring"); setError(null);
    try {
      const res = await fetch("/api/linkedin/profile-score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, locale, language, profile }) });
      const data = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok || !data.score) { setError(errorText(data.error ?? "generic")); return; }
      const r = data as Result;
      setResult(r); save(storeKey(clientId), { input: profile, result: r, link });
    } catch { setError(ta("errors.generic")); }
    finally { setBusy(null); }
  }

  /** Read the profile from its link (Apify), fill the form with it and score it. On failure the form stays for typing. */
  async function readAndScore() {
    setBusy("reading"); setError(null); setReadName(null);
    try {
      const res = await fetch("/api/linkedin/profile-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, url: link }) });
      const data = (await res.json().catch(() => ({}))) as { fields?: Partial<LinkedInProfileInput>; guessed?: string[]; name?: string; error?: string };
      if (!res.ok || !data.fields) { setOpen(true); setError(errorText(data.error ?? "read_failed")); setBusy(null); return; }
      // Banner text and anything LinkedIn does not show keep the person's earlier answer.
      const filled: LinkedInProfileInput = { ...input, ...Object.fromEntries(Object.entries(data.fields).filter(([, v]) => v !== undefined)) } as LinkedInProfileInput;
      setInput(filled); setGuessed(data.guessed ?? []); setReadName(data.name ?? null);
      if (!(filled.headline || filled.about || filled.currentRole)) { setOpen(true); setError(t("errors.read_empty")); setBusy(null); return; }
      await score(filled);
    } catch { setOpen(true); setError(ta("errors.generic")); setBusy(null); }
  }
  const linkOk = /linkedin\.com\/in\/[^/?#\s]+/i.test(link);
  const guess = (k: string) => (guessed.includes(k) ? " li-guess" : "");

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
      <form className="li-read" onSubmit={(e) => { e.preventDefault(); if (linkOk && !busy) void readAndScore(); }}>
        <label htmlFor="li-link">{t("linkLabel")}</label>
        <div className="li-read-row">
          <input id="li-link" type="url" inputMode="url" value={link} maxLength={300} placeholder="https://www.linkedin.com/in/…" onChange={(e) => setLink(e.target.value)} />
          <button type="submit" className="btn" disabled={!linkOk || busy !== null}>{busy === "reading" ? t("reading") : busy === "scoring" ? t("scoring") : result ? t("readAgain") : t("readAndScore")}</button>
        </div>
        <p className="stat-vs">{link && !linkOk ? t("linkHint") : t("readHint")}</p>
      </form>
      {readName && !busy && <p className="ok" role="status">{t("readDone", { name: readName })}</p>}
      {guessed.length > 0 && !busy && (
        <p className="li-guess-note">{t("checkGuesses", { list: guessed.map((k) => t(`fields.${k}`)).join(", ") })} {!open && <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>{t("openForm")}</button>}</p>
      )}
      {!open && <button type="button" className="btn small ghost" onClick={() => setOpen(true)}>{t("byHand")}</button>}
      {!open && error && <p className="error" role="alert">{error}</p>}

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
            <label className={guess("photo").trim() || undefined}>{t("fields.photo")}<select value={input.photo} onChange={(e) => set("photo", e.target.value as LinkedInProfileInput["photo"])}>{(["recent_face", "old_face", "logo_or_other", "none"] as const).map((v) => <option key={v} value={v}>{t(`photo.${v}`)}</option>)}</select></label>
            <label className={guess("activity").trim() || undefined}>{t("fields.activity")}<select value={input.activity} onChange={(e) => set("activity", e.target.value as LinkedInProfileInput["activity"])}>{(["7d", "30d", "older", "never"] as const).map((v) => <option key={v} value={v}>{t(`activity.${v}`)}</option>)}</select></label>
            <label>{t("fields.recommendations")}<input type="number" min={0} max={100} value={input.recommendations} onChange={(e) => set("recommendations", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} /></label>
          </div>
          <div className="li-checks">
            {(["recommendationsNameOutcomes", "customUrl", "contactLink", "sameHandle"] as const).map((k) => (
              <label key={k} className={`check-line${guess(k)}`}><input type="checkbox" checked={input[k]} onChange={(e) => set(k, e.target.checked)} /> <span>{t(`fields.${k}`)}</span></label>
            ))}
          </div>
          <div className="btn-row">
            <label className="li-lang">{t("language")}<select value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select></label>
            <button type="button" className="btn" onClick={() => score()} disabled={busy !== null || !(input.headline || input.about || input.currentRole)}>{busy === "scoring" ? t("scoring") : t("score")}</button>
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
