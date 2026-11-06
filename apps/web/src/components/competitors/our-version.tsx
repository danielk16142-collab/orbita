"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReelContentT } from "@orbita/content";
import { createPostAction } from "@/lib/posts-actions";
import { addStrategyTopicAction } from "@/lib/focus-actions";
import { NETWORK_LABEL } from "@/components/posts/shared";

export type TheirPostView = { id: string; hook: string; caption: string | null; transcript: string | null; network: string; url: string | null; competitor: string | null };
type Ours = { title: string; language: string; kept: string; changed: string; reel: ReelContentT; caption: string; hashtags: string[] };
const LANGS = ["same", "en", "fr", "es"];
const NETS = ["instagram", "tiktok", "facebook", "youtube", "linkedin"];

/**
 * "Make our version" right in the Competitors section: their post on one side, our version (built from that post) on the
 * other, editable, then added to the content calendar on the chosen date as a draft (an idea for client users).
 */
export function OurVersion({ post, clientId, locale, staff, postsBase, chatHref }: {
  post: TheirPostView; clientId?: string; locale: string; staff: boolean; postsBase: string; chatHref?: string;
}) {
  const t = useTranslations("wins.remake");
  const ta = useTranslations("agent");
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState("same");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [ours, setOurs] = useState<Ours | null>(null);
  const [hook, setHook] = useState(0);
  const [network, setNetwork] = useState(NETS.includes(post.network) ? post.network : "instagram");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inStrategy, setInStrategy] = useState(false);
  const [heard, setHeard] = useState<string | null>(post.transcript);
  const [transcribing, setTranscribing] = useState(false);
  const canTranscribe = staff && !!post.url && (post.network === "instagram" || post.network === "tiktok");
  const errorText = (c: string) => (t.has(`errors.${c}`) ? t(`errors.${c}`) : ta.has(`errors.${c}`) ? ta(`errors.${c}`) : ta("errors.generic"));

  async function write() {
    setBusy(true); setError(null); setSavedId(null);
    try {
      const res = await fetch("/api/competitors/remake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, postId: post.id, locale, language, transcript: transcript || heard || "", notes }) });
      const data = (await res.json().catch(() => ({}))) as { ours?: Ours; error?: string };
      if (!res.ok || !data.ours) { setError(errorText(data.error ?? "generic")); return; }
      setOurs(data.ours); setHook(0); setInStrategy(false);
    } catch { setError(ta("errors.generic")); }
    finally { setBusy(false); }
  }
  const edit = (patch: Partial<Ours>) => { setOurs((o) => (o ? { ...o, ...patch } : o)); setSavedId(null); };
  const editScene = (i: number, patch: Partial<ReelContentT["scenes"][number]>) => ours && edit({ reel: { ...ours.reel, scenes: ours.reel.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) } });

  async function save() {
    if (!ours) return;
    setSaving(true); setError(null);
    const hooks = [ours.reel.hook_options[hook], ...ours.reel.hook_options.filter((_, i) => i !== hook)].filter((h) => h?.trim());
    const r = await createPostAction({
      clientId, network, language: ["en", "fr", "es"].includes(ours.language) ? ours.language : locale, type: "reel", idea: ours.title || hooks[0] || post.hook.slice(0, 200), planned_date: date || null, status: "draft", from: "competitor",
      caption: ours.caption.trim() || undefined, hashtags: ours.hashtags, content: { ...ours.reel, hook_options: hooks },
    }).catch(() => ({ ok: false as const, error: "generic" }));
    setSaving(false);
    if (r.ok && r.id) setSavedId(r.id); else setError(errorText(r.ok ? "generic" : r.error));
  }

  /** Get what is said in their video automatically (the video is fetched and transcribed on the server, then saved on the post). */
  async function transcribe() {
    setTranscribing(true); setError(null);
    try {
      const res = await fetch("/api/competitors/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, postId: post.id }) });
      const data = (await res.json().catch(() => ({}))) as { transcript?: string; error?: string };
      if (data.transcript) setHeard(data.transcript);
      if (!res.ok) setError(errorText(data.error ?? "generic"));
    } catch { setError(ta("errors.generic")); }
    finally { setTranscribing(false); }
  }

  async function toStrategy() {
    if (!ours) return;
    setError(null);
    const r = await addStrategyTopicAction({ clientId, topic: (ours.title || ours.reel.hook_options[hook] || post.hook).slice(0, 200) }).catch(() => ({ ok: false as const, error: "generic" }));
    if (r.ok) setInStrategy(true); else setError(errorText(r.error));
  }

  if (!open) return <button type="button" className="btn small" onClick={() => setOpen(true)}>{t("open")}</button>;
  return (
    <div className="remake" role="region" aria-label={t("title")}>
      <div className="remake-cols">
        <section className="remake-col theirs" aria-label={t("theirs")}>
          <p className="eyebrow">{t("theirs")}{post.competitor ? ` · ${post.competitor}` : ""} · {NETWORK_LABEL[post.network] ?? post.network}</p>
          <p className="remake-hook">“{post.hook}”</p>
          {post.caption && <><h4>{t("caption")}</h4><p className="remake-text">{post.caption}</p></>}
          {heard
            ? <details open={heard !== post.transcript}><summary>{t("transcript")}</summary><p className="remake-text">{heard}</p></details>
            : <>
              {canTranscribe && (
                <div className="remake-transcribe">
                  <button type="button" className="btn small" onClick={transcribe} disabled={transcribing}>{transcribing ? t("transcribing") : t("transcribe")}</button>
                  <span className="stat-vs">{transcribing ? t("transcribingHint") : t("transcribeHint")}</span>
                </div>
              )}
              <label>{t("pasteTranscript")}<textarea rows={4} maxLength={8000} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder={t("pasteTranscriptHint")} /></label>
            </>}
          {post.url && <a href={post.url} target="_blank" rel="noopener noreferrer nofollow">{t("openTheirs")}</a>}
        </section>

        <section className="remake-col ours" aria-label={t("ours")}>
          <p className="eyebrow">{t("ours")}</p>
          {!ours && <p className="stat-vs">{t("intro")}</p>}
          <div className="plan-row">
            <label>{t("language")}<select value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((l) => <option key={l} value={l}>{l === "same" ? t("sameLanguage") : l.toUpperCase()}</option>)}</select></label>
          </div>
          <label>{t("notes")}<input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesHint")} /></label>
          <div className="btn-row">
            <button type="button" className="btn" onClick={write} disabled={busy}>{busy ? t("writing") : ours ? t("rewrite") : t("write")}</button>
            {chatHref && <Link className="btn ghost small" href={chatHref}>{t("inChat")}</Link>}
          </div>
          {ours && (
            <div className="remake-ours">
              {(ours.kept || ours.changed) && <p className="stat-vs remake-why">{ours.kept && <><strong>{t("kept")}</strong> {ours.kept} </>}{ours.changed && <><strong>{t("changed")}</strong> {ours.changed}</>}</p>}
              <fieldset className="remake-hooks"><legend>{t("hook")}</legend>
                {ours.reel.hook_options.map((h, i) => (
                  <label key={i} className="check-line"><input type="radio" name={`hook-${post.id}`} checked={hook === i} onChange={() => setHook(i)} />
                    <input value={h} maxLength={200} aria-label={t("hookN", { n: i + 1 })} onChange={(e) => edit({ reel: { ...ours.reel, hook_options: ours.reel.hook_options.map((x, j) => (j === i ? e.target.value : x)) } })} /></label>
                ))}
              </fieldset>
              <h4>{t("script", { seconds: ours.reel.duration_seconds })}</h4>
              <ol className="plain remake-scenes">
                {ours.reel.scenes.map((s, i) => (
                  <li key={i}>
                    <span className="stat-vs">{s.seconds} · {s.visual}</span>
                    <textarea rows={2} maxLength={600} value={s.voiceover} aria-label={t("voiceover", { n: i + 1 })} onChange={(e) => editScene(i, { voiceover: e.target.value })} />
                    <input value={s.on_screen_text} maxLength={200} aria-label={t("onScreen", { n: i + 1 })} placeholder={t("onScreenPlaceholder")} onChange={(e) => editScene(i, { on_screen_text: e.target.value })} />
                  </li>
                ))}
              </ol>
              <label>{t("cta")}<input value={ours.reel.cta} maxLength={200} onChange={(e) => edit({ reel: { ...ours.reel, cta: e.target.value } })} /></label>
              <label>{t("caption")}<textarea rows={6} maxLength={2200} value={ours.caption} onChange={(e) => edit({ caption: e.target.value })} /></label>
              <label>{t("hashtags")}<input value={ours.hashtags.map((h) => `#${h}`).join(" ")} maxLength={900} onChange={(e) => edit({ hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#+/, "")).filter(Boolean).slice(0, 30) })} /></label>

              <div className="remake-save">
                <div className="plan-row">
                  <label>{t("network")}<select value={network} onChange={(e) => setNetwork(e.target.value)}>{NETS.map((n) => <option key={n} value={n}>{NETWORK_LABEL[n] ?? n}</option>)}</select></label>
                  <label>{t("date")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn" onClick={save} disabled={saving || !!savedId}>{saving ? t("saving") : date ? t("addOn", { date }) : t("addNoDate")}</button>
                  {staff && <button type="button" className="btn ghost small" onClick={toStrategy} disabled={inStrategy}>{inStrategy ? `✓ ${t("inStrategy")}` : t("toStrategy")}</button>}
                </div>
                {savedId && <p className="ok" role="status">✓ {staff ? t("saved") : t("savedIdea")} <Link href={`${postsBase}/${savedId}`}>{t("openPost")}</Link> · <Link href={`${postsBase}?${new URLSearchParams({ view: "month", ...(date && { date }) })}`}>{t("openCalendar")}</Link></p>}
              </div>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </div>
      <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>{t("close")}</button>
    </div>
  );
}
