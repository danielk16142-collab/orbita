"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setVisualsModuleAction } from "@/lib/visuals-actions";

const f = { padding: ".5rem", border: "2px solid var(--line)", borderRadius: 10, font: "inherit", background: "#fff", color: "var(--ink)", width: "100%" } as const;

/** The on/off switch for visual creation on one client, with its monthly cap and optional Moda brand kit. Only agency admins can change it. */
export function VisualsCard({ clientId, enabled, monthlyCap, brandKitId, used, configured, canEdit }: {
  clientId: string; enabled: boolean; monthlyCap: number; brandKitId: string | null; used: number; configured: boolean; canEdit: boolean;
}) {
  const t = useTranslations("visuals");
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [cap, setCap] = useState(String(monthlyCap));
  const [kit, setKit] = useState(brandKitId ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const err = (e: string) => (t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.failed"));

  function save(next: boolean) {
    setMsg(null);
    start(async () => {
      const r = await setVisualsModuleAction({ clientId, enabled: next, monthlyCap: Number(cap), brandKitId: kit });
      if (r.ok) { setOn(next); setMsg({ ok: true, text: t("saved") }); router.refresh(); } else setMsg({ ok: false, text: err(r.error) });
    });
  }
  return (
    <section className="card visuals-card" aria-labelledby="visuals-title">
      <div className="section-head">
        <h2 id="visuals-title">{t("title")}</h2>
        <button type="button" role="switch" aria-checked={on} aria-label={t("switchLabel")} className={`switch${on ? " on" : ""}`} disabled={!canEdit || pending} onClick={() => save(!on)}>
          <span className="switch-knob" aria-hidden="true" /><span className="switch-text">{on ? t("on") : t("off")}</span>
        </button>
      </div>
      <p>{t("intro")}</p>
      {!configured && <p className="stat-vs" role="note">{t("notConfigured")}</p>}
      <div className="plan-row visuals-fields">
        <label>{t("cap")}<input type="number" min={0} max={1000} value={cap} onChange={(e) => setCap(e.target.value)} disabled={!canEdit} style={f} /></label>
        <label>{t("brandKit")}<input value={kit} maxLength={80} placeholder="bk_…" onChange={(e) => setKit(e.target.value)} disabled={!canEdit} style={f} /></label>
        <span />
      </div>
      <p className="stat-vs">{t("usage", { used, cap: monthlyCap })} · {t("capHint")}</p>
      <p className="stat-vs">{t("dataNote")}</p>
      {canEdit ? (
        <div className="agent-actions"><button type="button" className="btn small" disabled={pending} onClick={() => save(on)}>{t("save")}</button></div>
      ) : <p className="stat-vs">{t("adminOnly")}</p>}
      {msg && <p className={msg.ok ? undefined : "error"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </section>
  );
}
