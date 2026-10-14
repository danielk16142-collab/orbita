"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { BrandFocus, BrandPillar, BrandTopic, TopicLevel } from "@orbita/agent";
import { saveFocusAction } from "@/lib/focus-actions";

const LEVELS: TopicLevel[] = ["focus", "sometimes", "avoid"];
const DEFAULTS = ["ai", "social_media", "ads", "web_design", "ecommerce", "seo", "branding", "email", "video", "automation", "analytics", "customer_stories", "behind_scenes", "tips", "industry_news", "offers"];

/**
 * "What we talk about": the brand chooses its topics (focus, sometimes, avoid; from suggestions or its own) and its
 * content pillars (name, angle, share of the content, the topics each covers). The agent follows both.
 */
export function FocusEditor({ clientId, locale, initial, strategyHref }: { clientId?: string; locale: string; initial: BrandFocus; strategyHref: string }) {
  const t = useTranslations("focus");
  const router = useRouter();
  const [topics, setTopics] = useState<BrandTopic[]>(initial.topics);
  const [pillars, setPillars] = useState<BrandPillar[]>(initial.pillars);
  const [custom, setCustom] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"topics" | "pillars" | null>(null);
  const [saving, start] = useTransition();
  const touch = () => { setDirty(true); setNote(null); };
  const has = (n: string) => topics.some((x) => x.name.toLowerCase() === n.trim().toLowerCase());
  const addTopic = (n: string, level: TopicLevel = "focus") => { const name = n.trim().slice(0, 60); if (!name || has(name) || topics.length >= 40) return; setTopics((a) => [...a, { name, level }]); touch(); };
  const setLevel = (i: number, level: TopicLevel) => { setTopics((a) => a.map((x, j) => (j === i ? { ...x, level } : x))); touch(); };
  const removeTopic = (i: number) => { const n = topics[i].name; setTopics((a) => a.filter((_, j) => j !== i)); setPillars((ps) => ps.map((p) => ({ ...p, topics: p.topics.filter((x) => x !== n) }))); touch(); };
  const setPillar = (i: number, patch: Partial<BrandPillar>) => { setPillars((a) => a.map((p, j) => (j === i ? { ...p, ...patch } : p))); touch(); };
  const total = pillars.reduce((s, p) => s + (Number.isFinite(p.share) ? p.share : 0), 0);
  const usable = topics.filter((x) => x.level !== "avoid");
  const ideas = [...DEFAULTS.map((k) => t(`defaults.${k}`)), ...suggested].filter((n, i, a) => !has(n) && a.indexOf(n) === i);

  async function suggest(kind: "topics" | "pillars") {
    setBusy(kind); setNote(null);
    try {
      const res = await fetch("/api/brand/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, kind, locale, topics: usable.map((x) => x.name) }) });
      const data = (await res.json().catch(() => ({}))) as { topics?: BrandTopic[]; pillars?: BrandPillar[]; error?: string };
      if (!res.ok) { setNote({ ok: false, text: t.has(`errors.${data.error}`) ? t(`errors.${data.error}`) : t("errors.generic") }); return; }
      if (kind === "topics") setSuggested((s) => [...(data.topics ?? []).map((x) => x.name), ...s].slice(0, 16));
      else if (data.pillars?.length) {
        if (pillars.length && !window.confirm(t("replacePillars"))) return;
        setPillars(data.pillars.map((p) => ({ ...p, topics: p.topics.filter((n) => usable.some((u) => u.name === n)) })));
        for (const p of data.pillars) for (const n of p.topics) if (!has(n)) setTopics((a) => (a.some((x) => x.name.toLowerCase() === n.toLowerCase()) || a.length >= 40 ? a : [...a, { name: n.slice(0, 60), level: "sometimes" }]));
        touch();
      }
    } catch { setNote({ ok: false, text: t("errors.generic") }); }
    finally { setBusy(null); }
  }

  const save = () => start(async () => {
    const cleaned = pillars.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim(), angle: p.angle.trim(), share: Math.max(0, Math.min(100, Math.round(p.share || 0))) }));
    const r = await saveFocusAction({ clientId, focus: { topics, pillars: cleaned } });
    if (r.ok) { setDirty(false); setNote({ ok: true, text: t("saved") }); router.refresh(); }
    else setNote({ ok: false, text: t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic") });
  });

  return (
    <section className="card focus-editor" aria-labelledby="focus-h">
      <h2 id="focus-h">{t("title")}</h2>
      <p className="stat-vs">{t("intro")}</p>

      <h3>{t("topicsTitle")}</h3>
      {topics.length === 0 && <p className="stat-vs">{t("noTopics")}</p>}
      <ul className="plain focus-topics">
        {topics.map((x, i) => (
          <li key={x.name} className={`focus-topic level-${x.level}`}>
            <span className="focus-topic-name">{x.name}</span>
            <span className="focus-levels" role="group" aria-label={t("levelFor", { topic: x.name })}>
              {LEVELS.map((l) => <button key={l} type="button" aria-pressed={x.level === l} onClick={() => setLevel(i, l)}>{t(`levels.${l}`)}</button>)}
            </span>
            <button type="button" className="focus-remove" onClick={() => removeTopic(i)} aria-label={t("remove", { name: x.name })}>✕</button>
          </li>
        ))}
      </ul>
      <p className="eyebrow focus-sub">{t("ideas")}</p>
      <div className="focus-ideas">
        {ideas.map((n) => <button key={n} type="button" className="map-topic" onClick={() => addTopic(n)}>+ {n}</button>)}
        <button type="button" className="btn small ghost" onClick={() => suggest("topics")} disabled={busy !== null}>{busy === "topics" ? t("thinking") : t("suggestTopics")}</button>
      </div>
      <form className="focus-add" onSubmit={(e) => { e.preventDefault(); addTopic(custom); setCustom(""); }}>
        <label htmlFor="focus-custom" className="sr-only">{t("addTopic")}</label>
        <input id="focus-custom" value={custom} maxLength={60} placeholder={t("addPlaceholder")} onChange={(e) => setCustom(e.target.value)} />
        <button type="submit" className="btn small" disabled={!custom.trim()}>{t("addTopic")}</button>
      </form>

      <div className="section-head focus-pillars-head">
        <h3>{t("pillarsTitle")}</h3>
        <button type="button" className="btn small ghost" onClick={() => suggest("pillars")} disabled={busy !== null}>{busy === "pillars" ? t("thinking") : t("suggestPillars")}</button>
      </div>
      <p className="stat-vs">{t("pillarsHint")}</p>
      <div className="focus-pillars">
        {pillars.map((p, i) => (
          <div key={i} className="focus-pillar">
            <div className="focus-pillar-row">
              <label className="focus-field">{t("pillarName")}<input value={p.name} maxLength={80} onChange={(e) => setPillar(i, { name: e.target.value })} /></label>
              <label className="focus-field share">{t("share")}
                <span className="focus-share"><input type="range" min={0} max={100} step={5} value={p.share} onChange={(e) => setPillar(i, { share: Number(e.target.value) })} aria-label={t("share")} /><strong>{p.share}%</strong></span>
              </label>
              <button type="button" className="focus-remove" onClick={() => { setPillars((a) => a.filter((_, j) => j !== i)); touch(); }} aria-label={t("remove", { name: p.name || t("pillarName") })}>✕</button>
            </div>
            <label className="focus-field">{t("angle")}<input value={p.angle} maxLength={300} placeholder={t("anglePlaceholder")} onChange={(e) => setPillar(i, { angle: e.target.value })} /></label>
            {usable.length > 0 && (
              <div className="focus-pillar-topics" role="group" aria-label={t("pillarTopics")}>
                <span className="stat-vs">{t("pillarTopics")}</span>
                {usable.map((x) => {
                  const on = p.topics.includes(x.name);
                  return <button key={x.name} type="button" className="map-topic" aria-pressed={on} onClick={() => setPillar(i, { topics: on ? p.topics.filter((n) => n !== x.name) : [...p.topics, x.name].slice(0, 12) })}>{on ? "✓ " : ""}{x.name}</button>;
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="btn-row">
        {pillars.length < 8 && <button type="button" className="btn small ghost" onClick={() => { setPillars((a) => [...a, { name: "", angle: "", share: 0, topics: [] }]); touch(); }}>+ {t("addPillar")}</button>}
        {pillars.length > 0 && <span className={`focus-total${total === 100 ? " ok" : ""}`}>{t("total", { total })}</span>}
      </div>

      <div className="btn-row focus-save">
        <button type="button" className="btn" onClick={save} disabled={saving || !dirty}>{saving ? t("saving") : t("save")}</button>
        {note && <span className={note.ok ? "ok" : "error"} role="status">{note.text}</span>}
        {note?.ok && <Link href={strategyHref}>{t("applyToStrategy")}</Link>}
      </div>
    </section>
  );
}
