"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { decideProposalAction } from "@/lib/agent-actions";

type PlanItem = { day: string; network: string; format: string; pillar: string; idea: string; caption: string; language: string };
type Payload = Record<string, unknown>;
export type ProposalView = { id: string; target: "brief" | "memory" | "proof_item" | "rule" | "plan"; payload: Payload; reason: string | null };

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
  return (
    <article className="proposal">
      <p className="eyebrow">{t(`kinds.${proposal.target}`)}</p>
      {proposal.reason && <p className="proposal-reason">{proposal.reason}</p>}

      {proposal.target === "memory" && (<>
        <select aria-label={t("memoryKind")} style={field} value={String(p.kind)} onChange={(e) => set("kind", e.target.value)}>{MEMORY_KINDS.map((k) => <option key={k} value={k}>{t(`memoryKinds.${k}`)}</option>)}</select>
        {txt("content")}</>)}
      {proposal.target === "rule" && (<>{txt("rule")}<input aria-label={t("reasonLabel")} style={field} value={String(p.reason ?? "")} onChange={(e) => set("reason", e.target.value)} placeholder={t("reasonLabel")} /></>)}
      {proposal.target === "proof_item" && (<>{txt("claim")}<input aria-label={t("sourceLabel")} style={field} value={String(p.source ?? "")} onChange={(e) => set("source", e.target.value)} placeholder={t("sourceLabel")} /></>)}
      {proposal.target === "brief" && (<><p><strong>{t(`sections.${String(p.section)}`)}</strong></p>{txt("value", 4)}</>)}

      {proposal.target === "plan" && (<>
        <input aria-label={t("planTitle")} style={field} value={String(p.title ?? "")} onChange={(e) => set("title", e.target.value)} />
        <p className="eyebrow">{t("planWeek", { date: String(p.week_start) })}</p>
        {items.map((it, i) => (
          <fieldset key={i} className="plan-item" disabled={pending}>
            <label className="plan-include"><input type="checkbox" checked={included[i]} onChange={(e) => setIncluded((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} style={{ width: "auto" }} /> {t("include")}</label>
            <div className="plan-row">
              <select aria-label={t("day")} style={field} value={it.day} onChange={(e) => setItem(i, "day", e.target.value)}>{DAYS.map((d) => <option key={d} value={d}>{t(`days.${d}`)}</option>)}</select>
              <select aria-label={t("network")} style={field} value={it.network} onChange={(e) => setItem(i, "network", e.target.value)}>{NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <input aria-label={t("format")} style={field} value={it.format} onChange={(e) => setItem(i, "format", e.target.value)} />
            </div>
            <textarea aria-label={t("idea")} rows={2} style={field} value={it.idea} onChange={(e) => setItem(i, "idea", e.target.value)} />
            <textarea aria-label={t("caption")} rows={3} style={field} value={it.caption} placeholder={t("caption")} onChange={(e) => setItem(i, "caption", e.target.value)} />
          </fieldset>
        ))}
        <small>{t("planHint")}</small></>)}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="proposal-actions">
        <button type="button" className="btn" disabled={pending || (proposal.target === "plan" && !included.some(Boolean))} onClick={() => decide("accept")}>{proposal.target === "plan" ? t("acceptPlan") : t("accept")}</button>
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
