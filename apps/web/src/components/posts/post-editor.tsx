"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updatePostAction } from "@/lib/posts-actions";
import type { PostRow } from "@/lib/posts/access";

const NETWORKS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"], TYPES = ["reel", "carousel", "static", "story", "video", "text", "article", "post"], LANGS = ["en", "fr", "es"];
const f = { padding: ".5rem", border: "2px solid var(--line)", borderRadius: 10, font: "inherit", background: "#fff", color: "var(--ink)", width: "100%" } as const;
type Obj = Record<string, unknown>;
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Staff editor: details, caption, hashtags and the structured content of reels, carousels and static posts. The server validates everything. */
export function PostEditor({ post }: { post: PostRow }) {
  const t = useTranslations("posts");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [type, setType] = useState(post.type);
  const [content, setContent] = useState<Obj | null>((post.content as Obj | null) ?? null);
  const set = (k: string, v: unknown) => setContent((c) => ({ ...(c ?? {}), [k]: v }));
  const setItem = (key: string, i: number, k: string, v: string) => set(key, arr(content?.[key]).map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addItem = (key: string, blank: Obj) => set(key, [...arr(content?.[key]), blank]);
  const dropItem = (key: string, i: number) => set(key, arr(content?.[key]).filter((_, j) => j !== i));
  const hooks = Array.isArray(content?.hook_options) ? (content!.hook_options as string[]) : [];

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setSaved(false);
    const d = new FormData(e.currentTarget);
    let c: Obj | null = content;
    if (type === "reel") c = { duration_seconds: Number(c?.duration_seconds) || 30, hook_options: hooks.filter(Boolean), scenes: arr(c?.scenes), cta: str(c?.cta), audio_note: str(c?.audio_note) };
    else if (type !== "carousel" && type !== "static") c = null;
    start(async () => {
      const r = await updatePostAction({
        postId: post.id,
        edit: {
          network: d.get("network"), language: d.get("language"), type, pillar: d.get("pillar") ?? "", persona: d.get("persona") ?? "", funnel_stage: d.get("funnel_stage") ?? "",
          idea: d.get("idea") ?? "", caption: d.get("caption") ?? "",
          hashtags: String(d.get("hashtags") ?? "").split(/[\s,]+/).map((h) => h.trim()).filter(Boolean),
          planned_date: d.get("planned_date") ? String(d.get("planned_date")) : null, suggested_time: d.get("suggested_time") ?? "",
        },
        content: c,
      });
      if (r.ok) { setSaved(true); router.refresh(); } else setError(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic"));
    });
  }

  return (
    <form onSubmit={submit} className="card post-editor">
      <h2>{t("edit")}</h2>
      {post.status === "approved" && <p className="stat-vs">{t("editResetsApproval")}</p>}
      <div className="plan-row">
        <label>{t("network")}<select name="network" defaultValue={post.network} style={f}>{NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>{t("format")}<select value={type} onChange={(e) => setType(e.target.value)} style={f}>{TYPES.map((x) => <option key={x} value={x}>{t(`formats.${x}`)}</option>)}</select></label>
        <label>{t("language")}<select name="language" defaultValue={post.language} style={f}>{LANGS.map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></label>
      </div>
      <div className="plan-row">
        <label>{t("date")}<input type="date" name="planned_date" defaultValue={post.planned_date ?? ""} style={f} /></label>
        <label>{t("time")}<input type="time" name="suggested_time" defaultValue={post.suggested_time ?? ""} style={f} /></label>
        <label>{t("pillar")}<input name="pillar" defaultValue={post.pillar ?? ""} maxLength={80} style={f} /></label>
      </div>
      <div className="plan-row">
        <label>{t("persona")}<input name="persona" defaultValue={post.persona ?? ""} maxLength={80} style={f} /></label>
        <label>{t("funnel")}<input name="funnel_stage" defaultValue={post.funnel_stage ?? ""} maxLength={40} style={f} /></label>
        <span />
      </div>
      <label>{t("idea")}<textarea name="idea" defaultValue={post.idea ?? ""} rows={2} maxLength={2000} style={f} /></label>
      <label>{t("caption")}<textarea name="caption" defaultValue={post.caption ?? ""} rows={5} maxLength={2200} style={f} /></label>
      <label>{t("hashtags")}<input name="hashtags" defaultValue={(post.hashtags ?? []).join(" ")} style={f} /></label>

      {type === "reel" && (
        <fieldset className="content-editor"><legend>{t("reelContent")}</legend>
          <label>{t("duration")}<input type="number" min={5} max={180} value={Number(content?.duration_seconds) || 30} onChange={(e) => set("duration_seconds", Number(e.target.value))} style={f} /></label>
          {[0, 1, 2].map((i) => <label key={i}>{t("hook")} {i + 1}<input value={hooks[i] ?? ""} maxLength={200} style={f} onChange={(e) => { const h = [...hooks]; h[i] = e.target.value; set("hook_options", h.slice(0, 3)); }} /></label>)}
          {arr(content?.scenes).map((s, i) => (
            <div key={i} className="plan-item">
              <strong>{t("scene")} {i + 1}</strong>
              <input aria-label={t("seconds")} placeholder="0-3s" value={str(s.seconds)} maxLength={20} style={f} onChange={(e) => setItem("scenes", i, "seconds", e.target.value)} />
              <textarea aria-label={t("visual")} placeholder={t("visual")} value={str(s.visual)} rows={2} maxLength={300} style={f} onChange={(e) => setItem("scenes", i, "visual", e.target.value)} />
              <textarea aria-label={t("voiceover")} placeholder={t("voiceover")} value={str(s.voiceover)} rows={2} maxLength={600} style={f} onChange={(e) => setItem("scenes", i, "voiceover", e.target.value)} />
              <input aria-label={t("onScreen")} placeholder={t("onScreen")} value={str(s.on_screen_text)} maxLength={200} style={f} onChange={(e) => setItem("scenes", i, "on_screen_text", e.target.value)} />
              <button type="button" className="btn ghost small" onClick={() => dropItem("scenes", i)}>{t("remove")}</button>
            </div>
          ))}
          {arr(content?.scenes).length < 15 && <button type="button" className="btn ghost small" onClick={() => addItem("scenes", { seconds: "", visual: "", voiceover: "", on_screen_text: "" })}>{t("addScene")}</button>}
          <label>{t("cta")}<input value={str(content?.cta)} maxLength={200} style={f} onChange={(e) => set("cta", e.target.value)} /></label>
          <label>{t("audio")}<input value={str(content?.audio_note)} maxLength={200} style={f} onChange={(e) => set("audio_note", e.target.value)} /></label>
        </fieldset>
      )}
      {type === "carousel" && (
        <fieldset className="content-editor"><legend>{t("carouselContent")}</legend>
          {arr(content?.slides).map((s, i) => (
            <div key={i} className="plan-item">
              <strong>{t("slide")} {i + 1}</strong>
              <input aria-label={t("slideTitle")} placeholder={t("slideTitle")} value={str(s.title)} maxLength={120} style={f} onChange={(e) => setItem("slides", i, "title", e.target.value)} />
              <textarea aria-label={t("slideBody")} placeholder={t("slideBody")} value={str(s.body)} rows={2} maxLength={500} style={f} onChange={(e) => setItem("slides", i, "body", e.target.value)} />
              <input aria-label={t("visual")} placeholder={t("visual")} value={str(s.visual)} maxLength={300} style={f} onChange={(e) => setItem("slides", i, "visual", e.target.value)} />
              <button type="button" className="btn ghost small" onClick={() => dropItem("slides", i)}>{t("remove")}</button>
            </div>
          ))}
          {arr(content?.slides).length < 12 && <button type="button" className="btn ghost small" onClick={() => addItem("slides", { title: "", body: "", visual: "" })}>{t("addSlide")}</button>}
          <label>{t("cta")}<input value={str(content?.cta)} maxLength={200} style={f} onChange={(e) => set("cta", e.target.value)} /></label>
        </fieldset>
      )}
      {type === "static" && (
        <fieldset className="content-editor"><legend>{t("staticContent")}</legend>
          <label>{t("headline")}<input value={str(content?.headline)} maxLength={160} style={f} onChange={(e) => set("headline", e.target.value)} /></label>
          <label>{t("visualBrief")}<textarea value={str(content?.visual_brief)} rows={3} maxLength={500} style={f} onChange={(e) => set("visual_brief", e.target.value)} /></label>
          <label>{t("cta")}<input value={str(content?.cta)} maxLength={200} style={f} onChange={(e) => set("cta", e.target.value)} /></label>
        </fieldset>
      )}
      <div className="agent-actions">
        <button className="btn" disabled={pending}>{t("save")}</button>
        {saved && <span role="status">{t("saved")}</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
