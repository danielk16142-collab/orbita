"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { decideProposalAction } from "@/lib/agent-actions";

type PlanItem = { day: string; network: string; format: string; pillar: string; idea: string; caption: string; language: string; time: string; why: string };
type Payload = Record<string, any>; // validated server-side on accept; the card only edits text fields
export type ProposalView = { id: string; target: "brief" | "memory" | "proof_item" | "rule" | "plan" | "post" | "strategy"; payload: Payload; reason: string | null };

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const NETWORKS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"];
const MEMORY_KINDS = ["preference", "avoid", "rule", "fact", "example"];
const field = { width: "100%", padding: ".5rem", border: "2px solid var(--line)", borderRadius: 10, font: "inherit", background: "#fff", color: "var(--ink)" } as const;

/** One suggestion from the agent. Everything is editable before accepting; accepting with edits teaches the agent what you actually wanted. */
export function ProposalCard({ proposal, clientId }: { proposal: ProposalView; clientId?: string }) {
  const t = useTranslations("agent");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState("");
  const [p, setP] = useState<Payload>(proposal.payload);
  const [included, setIncluded] = useState<boolean[]>(() => ((proposal.payload.items as PlanItem[]) ?? []).map(() => true));
  const set = (k: string, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  const setContent = (fn: (c: Payload) => Payload) => setP((x) => ({ ...x, content: fn(structuredClone(x.content)) }));
  const items = (p.items as PlanItem[] | undefined) ?? [];
  const setItem = (i: number, k: keyof PlanItem, v: string) => set("items", items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  function decide(decision: "accept" | "reject") {
    setError(null);
    const edited = proposal.target === "plan" ? { ...p, items: items.filter((_, i) => included[i]) } : p;
    start(async () => {
      const r = await decideProposalAction({ clientId, proposalId: proposal.id, decision, comment: decision === "reject" ? why : undefined, edited: decision === "accept" ? edited : undefined });
      if (r.ok) router.refresh();
      else setError(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic"));
    });
  }

  const txt = (k: string, rows = 2) => <textarea aria-label={k} rows={rows} style={field} value={String(p[k] ?? "")} onChange={(e) => set(k, e.target.value)} />;
  const c = p.content as Payload | undefined;
  const lbl = (text: string) => <span className="eyebrow">{text}</span>;
  const acceptLabel = proposal.target === "plan" ? t("acceptPlan") : proposal.target === "post" ? t("acceptPost") : proposal.target === "strategy" ? t("acceptStrategy") : t("accept");

  return (
    <article className="proposal">
      <p className="eyebrow">{proposal.target === "post" ? `${t(`formats.${p.format}`)} · ${p.network} · ${String(p.language).toUpperCase()}` : t(`kinds.${proposal.target}`)}</p>
      {proposal.reason && <p className="proposal-reason">{proposal.reason}</p>}

      {proposal.target === "memory" && (<>
        <select aria-label={t("memoryKind")} style={field} value={String(p.kind)} onChange={(e) => set("kind", e.target.value)}>{MEMORY_KINDS.map((k) => <option key={k} value={k}>{t(`memoryKinds.${k}`)}</option>)}</select>
        {txt("content")}</>)}
      {proposal.target === "rule" && (<>{txt("rule")}<input aria-label={t("reasonLabel")} style={field} value={String(p.reason ?? "")} onChange={(e) => set("reason", e.target.value)} placeholder={t("reasonLabel")} /></>)}
      {proposal.target === "proof_item" && (<>{txt("claim")}<input aria-label={t("sourceLabel")} style={field} value={String(p.source ?? "")} onChange={(e) => set("source", e.target.value)} placeholder={t("sourceLabel")} /></>)}
      {proposal.target === "brief" && (<><p><strong>{t(`sections.${String(p.section)}`)}</strong></p>{txt("value", 4)}</>)}

      {proposal.target === "post" && c && (<>
        <div className="plan-row">
          <select aria-label={t("day")} style={field} value={p.day} onChange={(e) => set("day", e.target.value)}>{DAYS.map((d) => <option key={d} value={d}>{t(`days.${d}`)}</option>)}</select>
          <input aria-label={t("time")} placeholder="HH:MM" style={field} value={String(p.suggested_time ?? "")} onChange={(e) => set("suggested_time", e.target.value)} maxLength={5} />
          <input aria-label={t("pillar")} placeholder={t("pillar")} style={field} value={String(p.pillar ?? "")} onChange={(e) => set("pillar", e.target.value)} />
        </div>
        {lbl(t("idea"))}{txt("idea")}

        {p.format === "reel" && (<>
          {lbl(`${t("hooks")} · ${c.duration_seconds}s`)}
          {(c.hook_options as string[]).map((h, i) => <input key={i} aria-label={`${t("hook")} ${i + 1}`} style={field} value={h} onChange={(e) => setContent((x) => { x.hook_options[i] = e.target.value; return x; })} />)}
          {lbl(t("script"))}
          {(c.scenes as Payload[]).map((s, i) => (
            <fieldset key={i} className="plan-item" disabled={pending}>
              <strong>{s.seconds}</strong>
              <textarea aria-label={t("visual")} placeholder={t("visual")} rows={2} style={field} value={s.visual} onChange={(e) => setContent((x) => { x.scenes[i].visual = e.target.value; return x; })} />
              <textarea aria-label={t("voiceover")} placeholder={t("voiceover")} rows={2} style={field} value={s.voiceover} onChange={(e) => setContent((x) => { x.scenes[i].voiceover = e.target.value; return x; })} />
              <input aria-label={t("onScreen")} placeholder={t("onScreen")} style={field} value={s.on_screen_text} onChange={(e) => setContent((x) => { x.scenes[i].on_screen_text = e.target.value; return x; })} />
            </fieldset>))}
          {lbl(t("cta"))}<input aria-label={t("cta")} style={field} value={c.cta} onChange={(e) => setContent((x) => ({ ...x, cta: e.target.value }))} />
        </>)}

        {p.format === "carousel" && (<>
          {lbl(t("slides"))}
          {(c.slides as Payload[]).map((s, i) => (
            <fieldset key={i} className="plan-item" disabled={pending}>
              <strong>{t("slide", { n: i + 1 })}</strong>
              <input aria-label={t("slideTitle")} placeholder={t("slideTitle")} style={field} value={s.title} onChange={(e) => setContent((x) => { x.slides[i].title = e.target.value; return x; })} />
              <textarea aria-label={t("slideBody")} placeholder={t("slideBody")} rows={2} style={field} value={s.body} onChange={(e) => setContent((x) => { x.slides[i].body = e.target.value; return x; })} />
              <input aria-label={t("visual")} placeholder={t("visual")} style={field} value={s.visual} onChange={(e) => setContent((x) => { x.slides[i].visual = e.target.value; return x; })} />
            </fieldset>))}
          {lbl(t("cta"))}<input aria-label={t("cta")} style={field} value={c.cta} onChange={(e) => setContent((x) => ({ ...x, cta: e.target.value }))} />
        </>)}

        {p.format === "static" && (<>
          {lbl(t("headline"))}<input aria-label={t("headline")} style={field} value={c.headline} onChange={(e) => setContent((x) => ({ ...x, headline: e.target.value }))} />
          {lbl(t("visualBrief"))}<textarea aria-label={t("visualBrief")} rows={3} style={field} value={c.visual_brief} onChange={(e) => setContent((x) => ({ ...x, visual_brief: e.target.value }))} />
          {lbl(t("cta"))}<input aria-label={t("cta")} style={field} value={c.cta} onChange={(e) => setContent((x) => ({ ...x, cta: e.target.value }))} />
        </>)}

        {lbl(t("caption"))}{txt("caption", 4)}
        {lbl(t("hashtags"))}<input aria-label={t("hashtags")} style={field} value={(p.hashtags as string[]).join(" ")} onChange={(e) => set("hashtags", e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean).slice(0, 30))} />
        <small>{t("postHint")}</small>
      </>)}

      {proposal.target === "strategy" && c && (<>
        <input aria-label={t("planTitle")} style={field} value={String(p.title ?? "")} onChange={(e) => set("title", e.target.value)} />
        <p className="eyebrow">{t(`periods.${p.period}`)}</p>
        {lbl(t("objectives"))}<ul>{(c.objectives as string[]).map((o, i) => <li key={i}>{o}</li>)}</ul>
        {lbl(t("pillars"))}<ul>{(c.pillars as Payload[]).map((x, i) => <li key={i}><strong>{x.name}</strong> ({x.share_percent}%): {x.angle}</li>)}</ul>
        {(c.series as Payload[]).length > 0 && <>{lbl(t("series"))}<ul>{(c.series as Payload[]).map((x, i) => <li key={i}><strong>{x.name}</strong>: {x.subject} ({(x.formats as string[]).join(", ")} · {(x.networks as string[]).join(", ")})</li>)}</ul></>}
        {lbl(t("cadence"))}<ul>{(c.cadence as Payload[]).map((x, i) => <li key={i}><strong>{x.network}</strong>: {x.posts_per_week}/{t("perWeek")} · {(x.best_days as string[]).map((d) => t(`days.${d}`)).join(", ")} {x.best_time}<br /><small>{x.why}</small></li>)}</ul>
        {lbl(t("topics"))}
        <textarea aria-label={t("topics")} rows={6} style={field} value={(c.topics as string[]).join("\n")} onChange={(e) => setContent((x) => ({ ...x, topics: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 25) }))} />
        {lbl(t("rationale"))}<p>{c.rationale}</p>
      </>)}

      {proposal.target === "plan" && (<>
        <input aria-label={t("planTitle")} style={field} value={String(p.title ?? "")} onChange={(e) => set("title", e.target.value)} />
        <p className="eyebrow">{t("planWeek", { date: String(p.week_start) })}</p>
        {lbl(t("strategyNote"))}{txt("strategy_note", 3)}
        {items.map((it, i) => (
          <fieldset key={i} className="plan-item" disabled={pending}>
            <label className="plan-include"><input type="checkbox" checked={included[i]} onChange={(e) => setIncluded((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} style={{ width: "auto" }} /> {t("include")}</label>
            <div className="plan-row">
              <select aria-label={t("day")} style={field} value={it.day} onChange={(e) => setItem(i, "day", e.target.value)}>{DAYS.map((d) => <option key={d} value={d}>{t(`days.${d}`)}</option>)}</select>
              <select aria-label={t("network")} style={field} value={it.network} onChange={(e) => setItem(i, "network", e.target.value)}>{NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <input aria-label={t("time")} placeholder="HH:MM" style={field} value={it.time} maxLength={5} onChange={(e) => setItem(i, "time", e.target.value)} />
            </div>
            <input aria-label={t("format")} style={field} value={it.format} onChange={(e) => setItem(i, "format", e.target.value)} />
            <textarea aria-label={t("idea")} rows={2} style={field} value={it.idea} onChange={(e) => setItem(i, "idea", e.target.value)} />
            <input aria-label={t("whyThis")} placeholder={t("whyThis")} style={field} value={it.why} onChange={(e) => setItem(i, "why", e.target.value)} />
          </fieldset>
        ))}
        <small>{t("planHint")}</small></>)}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="proposal-actions">
        <button type="button" className="btn" disabled={pending || (proposal.target === "plan" && !included.some(Boolean))} onClick={() => decide("accept")}>{acceptLabel}</button>
        {!rejecting ? <button type="button" className="btn ghost" disabled={pending} onClick={() => setRejecting(true)}>{t("reject")}</button> : (
          <span className="reject-row">
            <input aria-label={t("whyNot")} placeholder={t("whyNot")} style={field} value={why} maxLength={1000} onChange={(e) => setWhy(e.target.value)} />
            <button type="button" className="btn ghost" disabled={pending} onClick={() => decide("reject")}>{t("reject")}</button>
          </span>
        )}
      </div>
    </article>
  );
}
