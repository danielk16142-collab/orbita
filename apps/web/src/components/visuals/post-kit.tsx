"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { buildPromptKit, KIT_TOOLS, kitText, type BrandInfo, type KitTool } from "@orbita/visuals";
import { CopyButton } from "@/components/posts/copy-button";

export type KitRef = { kind: string; caption: string | null; url: string | null };
const TAB_KEY: Record<KitTool, string> = { midjourney: "midjourney", "gpt-image": "gptImage", video: "video", layout: "layout" };
const notesKey = (postId: string) => `orbita.kitnotes.${postId}`;

/**
 * Prompts and briefs for making a post's images and videos outside Orbita. Built right here from the post and the brand (nothing is sent
 * anywhere); "Refine with the agent" asks the server for a more vivid rewrite of one tab. Notes typed here stay in this browser.
 */
export function PostKit({ postId, post, brand, refs }: { postId: string; post: { type: string; content: unknown }; brand: BrandInfo; refs: KitRef[] }) {
  const t = useTranslations("visuals.kit");
  const [tool, setTool] = useState<KitTool>("midjourney");
  const [notes, setNotes] = useState("");
  const [refined, setRefined] = useState<Partial<Record<KitTool, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { try { setNotes(localStorage.getItem(notesKey(postId)) ?? ""); } catch { /* storage unavailable */ } }, [postId]);
  const onNotes = (v: string) => { setNotes(v); try { localStorage.setItem(notesKey(postId), v); } catch { /* ignore */ } };

  const result = useMemo(() => buildPromptKit(post, brand, refs.map((r) => ({ kind: r.kind, caption: r.caption })), notes), [post, brand, refs, notes]);
  if (!result.ok) return <section className="card kit" style={{ marginTop: "1.25rem" }}><h2>{t("title")}</h2><p className="stat-vs">{t(result.error === "unsupported" ? "unsupported" : "noContent")}</p></section>;
  const blocks = result.kit[tool];

  async function refine() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/visuals/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, tool, notes }) });
      const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (res.ok && j.text) setRefined((r) => ({ ...r, [tool]: j.text }));
      else setError(t.has(`errors.${j.error}`) ? t(`errors.${j.error}`) : t("errors.failed"));
    } catch { setError(t("errors.failed")); }
    finally { setBusy(false); }
  }

  return (
    <section className="card kit" style={{ marginTop: "1.25rem" }} aria-labelledby="kit-title">
      <h2 id="kit-title">{t("title")}</h2>
      <p>{t("intro")}</p>

      <h3>{t("referencesTitle")}</h3>
      {refs.some((r) => r.url) ? (
        <ul className="kit-refs">{refs.filter((r) => r.url).slice(0, 12).map((r, i) => (
          <li key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.url!} alt={r.caption ?? r.kind} loading="lazy" width={96} height={96} />
            <span className="stat-vs">{r.kind}{r.caption ? ` · ${r.caption}` : ""}</span>
            <a className="btn ghost small" href={r.url!} download>{t("download")}</a>
          </li>))}</ul>
      ) : <p className="stat-vs">{t("noReferences")}</p>}
      <p className="stat-vs">{t("referencesHint")}</p>

      <label className="kit-notes">{t("notesLabel")}
        <textarea value={notes} onChange={(e) => onNotes(e.target.value)} rows={2} maxLength={600} placeholder={t("notesPlaceholder")} />
      </label>
      <p className="stat-vs">{t("notesHint")}</p>

      <div className="kit-tabs" role="tablist" aria-label={t("title")}>
        {KIT_TOOLS.map((k) => <button key={k} type="button" role="tab" aria-selected={k === tool} className={`btn small ${k === tool ? "" : "ghost"}`} onClick={() => { setTool(k); setError(null); }}>{t(`tabs.${TAB_KEY[k]}`)}</button>)}
      </div>

      <div className="section-head" style={{ marginTop: ".75rem" }}>
        <p className="stat-vs" style={{ margin: 0 }}>{t(`hint.${TAB_KEY[tool]}`)}</p>
        <div className="btn-row">
          <CopyButton text={kitText(blocks)} label={t("copyAll")} done={t("copied")} />
          <button type="button" className="btn small" onClick={refine} disabled={busy}>{busy ? t("refining") : t("refine")}</button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {refined[tool] && (
        <div className="kit-block refined">
          <div className="section-head"><h3>{t("refined")}</h3><CopyButton text={refined[tool]!} label={t("copy")} done={t("copied")} /></div>
          <pre>{refined[tool]}</pre>
        </div>
      )}
      {blocks.map((b) => (
        <div key={b.id} className="kit-block">
          <div className="section-head"><h3>{b.title}</h3><CopyButton text={b.text} label={t("copy")} done={t("copied")} /></div>
          <pre>{b.text}</pre>
        </div>
      ))}
    </section>
  );
}
