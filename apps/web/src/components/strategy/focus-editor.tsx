"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { syncTopics, type BrandFocus, type BrandPillar, type BrandTopic, type WeekFocus } from "@orbita/agent/focus";
import { saveFocusAction } from "@/lib/focus-actions";
import { BuildStrategyButton } from "./build-strategy";

const DEFAULTS = ["ai", "social_media", "ads", "web_design", "ecommerce", "seo", "branding", "email", "video", "automation", "analytics", "customer_stories", "behind_scenes", "tips", "industry_news", "offers"];
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * "What we talk about", in the Strategy section: the content pillars (name, angle, share, the topics each covers) and the
 * topics, which follow the pillars (a topic a pillar covers is a focus topic; "avoid" always wins). Updated with the
 * strategy week after week; "This week" shows the pillars this week's posts use and so the topics in play.
 */
export function FocusEditor({ clientId, locale, initial, week, hasStrategy }: { clientId?: string; locale: string; initial: BrandFocus; week: WeekFocus; hasStrategy: boolean }) {
  const t = useTranslations("focus");
  const router = useRouter();
  const [focus, setFocus] = useState<BrandFocus>(() => syncTopics(initial));
  const [custom, setCustom] = useState("");
  const [pillarInput, setPillarInput] = useState<Record<number, string>>({});
  const [suggested, setSuggested] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"topics" | "pillars" | `pillar-${number}` | null>(null);
  const [saving, start] = useTransition();
  const { topics, pillars } = focus;
  /** Every change goes through syncTopics, so the topics always follow the pillars. */
  const update = (fn: (f: BrandFocus) => BrandFocus) => { setFocus((f) => syncTopics(fn(f))); setDirty(true); setNote(null); };
  const has = (n: string) => topics.some((x) => same(x.name, n));
  const addTopic = (n: string, level: BrandTopic["level"] = "sometimes") => { const name = n.trim().slice(0, 60); if (!name || has(name) || topics.length >= 40) return; update((f) => ({ ...f, topics: [...f.topics, { name, level }] })); };
  const toggleAvoid = (name: string) => update((f) => ({ ...f, topics: f.topics.map((x) => (x.name === name ? { ...x, level: x.level === "avoid" ? "sometimes" : "avoid" } : x)) }));
  const removeTopic = (name: string) => update((f) => ({ topics: f.topics.filter((x) => x.name !== name), pillars: f.pillars.map((p) => ({ ...p, topics: p.topics.filter((x) => !same(x, name)) })) }));
  const setPillar = (i: number, patch: Partial<BrandPillar>) => update((f) => ({ ...f, pillars: f.pillars.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const addPillarTopic = (i: number) => {
    const name = (pillarInput[i] ?? "").trim().slice(0, 60);
    if (!name || pillars[i].topics.length >= 12) return;
    const existing = topics.find((x) => same(x.name, name));
    if (existing?.level === "avoid") return; // avoided topics stay out of the pillars
    setPillar(i, { topics: [...pillars[i].topics.filter((x) => !same(x, name)), existing?.name ?? name] });
    setPillarInput((s) => ({ ...s, [i]: "" }));
  };
  const pillarsOf = (name: string) => pillars.filter((p) => p.topics.some((x) => same(x, name))).map((p) => p.name || t("pillarName"));
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
        update((f) => ({ ...f, pillars: data.pillars!.map((p) => ({ ...p, topics: p.topics.slice(0, 12) })) })); // their topics join the list as focus topics
      }
    } catch { setNote({ ok: false, text: t("errors.generic") }); }
    finally { setBusy(null); }
  }

  /** Save the pillars and topics; true when saved (or nothing to save). */
  async function persist(f: BrandFocus = focus, force = false): Promise<boolean> {
    if (!dirty && !force) return true;
    const cleaned = f.pillars.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim(), angle: p.angle.trim(), share: Math.max(0, Math.min(100, Math.round(p.share || 0))) }));
    const r = await saveFocusAction({ clientId, focus: { topics: f.topics, pillars: cleaned } });
    if (r.ok) { setDirty(false); setNote({ ok: true, text: t("saved") }); router.refresh(); return true; }
    setNote({ ok: false, text: t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic") });
    return false;
  }
  const save = () => start(async () => { await persist(); });

  /**
   * "Update" on a pillar: the agent picks new topics from the pillar's name and angle, they replace the pillar's topics,
   * the old ones no other pillar uses leave the list (avoided topics stay), and everything is saved.
   */
  async function refreshPillar(i: number) {
    const p = pillars[i];
    if (!p?.name.trim()) return;
    setBusy(`pillar-${i}`); setNote(null);
    try {
      const others = pillars.flatMap((q, j) => (j === i ? [] : q.topics));
      const avoid = topics.filter((x) => x.level === "avoid").map((x) => x.name);
      const res = await fetch("/api/brand/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, kind: "pillar", locale, pillar: { name: p.name.trim(), angle: p.angle.trim() }, others, avoid }) });
      const data = (await res.json().catch(() => ({}))) as { topics?: BrandTopic[]; error?: string };
      if (!res.ok) { setNote({ ok: false, text: t.has(`errors.${data.error}`) ? t(`errors.${data.error}`) : t("errors.generic") }); return; }
      const fresh = (data.topics ?? []).map((x) => x.name.trim().slice(0, 60)).filter((n, k, a) => n && !avoid.some((v) => same(v, n)) && a.findIndex((m) => same(m, n)) === k).slice(0, 12);
      if (!fresh.length) { setNote({ ok: false, text: t("errors.no_result") }); return; }
      const dropped = p.topics.filter((n) => !fresh.some((m) => same(m, n)) && !others.some((m) => same(m, n)));
      const next = syncTopics({
        topics: focus.topics.filter((x) => x.level === "avoid" || !dropped.some((n) => same(n, x.name))),
        pillars: focus.pillars.map((q, j) => (j === i ? { ...q, topics: fresh } : q)),
      });
      setFocus(next); setDirty(true);
      if (await persist(next, true)) setNote({ ok: true, text: t("pillarUpdated", { name: p.name.trim(), count: fresh.length }) });
    } catch { setNote({ ok: false, text: t("errors.generic") }); }
    finally { setBusy(null); }
  }
  const named = pillars.some((p) => p.name.trim());

  return (
    <section className="card focus-editor" id="focus" aria-labelledby="focus-h">
      <h2 id="focus-h">{t("title")}</h2>
      <p className="stat-vs">{t("intro")}</p>

      {week.pillars.length > 0 && (
        <div className="focus-week" aria-label={t("weekTitle")}>
          <p className="eyebrow">{t("weekTitle")}</p>
          <p className="focus-week-pillars">
            {week.pillars.map((p) => <span key={p.name} className="badge">{p.name}{week.fromPlan ? ` · ${t("weekPosts", { count: p.posts })}` : ""}</span>)}
          </p>
          <p className="stat-vs">{week.fromPlan ? t("weekFromPlan") : t("weekByShare")}</p>
          {week.topics.length > 0 && <p className="focus-week-topics"><strong>{t("weekTopics")}</strong> {week.topics.join(", ")}</p>}
        </div>
      )}

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
              <button type="button" className="btn small ghost focus-refresh" onClick={() => refreshPillar(i)} disabled={busy !== null || saving || !p.name.trim()} title={t("updatePillarHint")}>{busy === `pillar-${i}` ? t("thinking") : t("updatePillar")}</button>
              <button type="button" className="focus-remove" onClick={() => update((f) => ({ ...f, pillars: f.pillars.filter((_, j) => j !== i) }))} aria-label={t("remove", { name: p.name || t("pillarName") })}>✕</button>
            </div>
            <label className="focus-field">{t("angle")}<input value={p.angle} maxLength={300} placeholder={t("anglePlaceholder")} onChange={(e) => setPillar(i, { angle: e.target.value })} /></label>
            <div className="focus-pillar-topics" role="group" aria-label={t("pillarTopics")}>
              <span className="stat-vs">{t("pillarTopics")}</span>
              {usable.map((x) => {
                const on = p.topics.some((n) => same(n, x.name));
                return <button key={x.name} type="button" className="map-topic" aria-pressed={on} onClick={() => setPillar(i, { topics: on ? p.topics.filter((n) => !same(n, x.name)) : [...p.topics, x.name].slice(0, 12) })}>{on ? "✓ " : ""}{x.name}</button>;
              })}
            </div>
            <form className="focus-add inline" onSubmit={(e) => { e.preventDefault(); addPillarTopic(i); }}>
              <label htmlFor={`focus-pt-${i}`} className="sr-only">{t("addToPillar", { name: p.name || t("pillarName") })}</label>
              <input id={`focus-pt-${i}`} value={pillarInput[i] ?? ""} maxLength={60} placeholder={t("addToPillarPlaceholder")} onChange={(e) => setPillarInput((s) => ({ ...s, [i]: e.target.value }))} />
              <button type="submit" className="btn small ghost" disabled={!(pillarInput[i] ?? "").trim()}>{t("addTopic")}</button>
            </form>
          </div>
        ))}
      </div>
      <div className="btn-row">
        {pillars.length < 8 && <button type="button" className="btn small ghost" onClick={() => update((f) => ({ ...f, pillars: [...f.pillars, { name: "", angle: "", share: 0, topics: [] }] }))}>+ {t("addPillar")}</button>}
        {pillars.length > 0 && <span className={`focus-total${total === 100 ? " ok" : ""}`}>{t("total", { total })}</span>}
      </div>

      <h3>{t("topicsTitle")}</h3>
      <p className="stat-vs">{t("topicsHint")}</p>
      {topics.length === 0 && <p className="stat-vs">{t("noTopics")}</p>}
      <ul className="plain focus-topics">
        {topics.map((x) => {
          const via = x.level === "focus" ? pillarsOf(x.name) : [];
          return (
            <li key={x.name} className={`focus-topic level-${x.level}`}>
              <span className="focus-topic-name">{x.name}</span>
              <span className="focus-topic-level">{x.level === "focus" ? t("inPillars", { list: via.join(", ") }) : t(`levels.${x.level}`)}</span>
              <button type="button" className="focus-avoid" aria-pressed={x.level === "avoid"} onClick={() => toggleAvoid(x.name)}>{x.level === "avoid" ? t("allow") : t("levels.avoid")}</button>
              <button type="button" className="focus-remove" onClick={() => removeTopic(x.name)} aria-label={t("remove", { name: x.name })}>✕</button>
            </li>
          );
        })}
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

      <div className="btn-row focus-save">
        <button type="button" className="btn" onClick={save} disabled={saving || !dirty}>{saving ? t("saving") : t("save")}</button>
        {note && <span className={note.ok ? "ok" : "error"} role="status">{note.text}</span>}
      </div>
      {named && (
        <div className="focus-build">
          <p className="stat-vs">{hasStrategy ? t("rebuildHint") : t("buildHint")}</p>
          <BuildStrategyButton clientId={clientId} locale={locale} hasStrategy={hasStrategy} beforeBuild={persist} />
        </div>
      )}
    </section>
  );
}
