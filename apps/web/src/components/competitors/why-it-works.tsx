"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Breakdown } from "@orbita/agent";

/** "Why it works" on one competitor post: the saved breakdown, or a button that has the agent explain it (and saves it). */
export function WhyItWorks({ postId, clientId, locale, initial }: { postId: string; clientId?: string; locale: string; initial: Breakdown | null }) {
  const t = useTranslations("wins.why");
  const ta = useTranslations("agent");
  const router = useRouter();
  const [b, setB] = useState<Breakdown | null>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explain() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/competitors/breakdown", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, postId, locale }) });
      const data = (await res.json().catch(() => ({}))) as { breakdown?: Breakdown; error?: string; detail?: string };
      if (data.breakdown) { setB(data.breakdown); setOpen(true); router.refresh(); }
      if (!res.ok) { const c = data.error ?? (res.status === 504 ? "timeout" : "generic"); const msg = t.has(`errors.${c}`) ? t(`errors.${c}`) : ta.has(`errors.${c}`) ? ta(`errors.${c}`) : ta("errors.generic"); setError(data.detail ? `${msg} (${data.detail})` : msg); }
    } catch { setError(ta("errors.generic")); }
    finally { setBusy(false); }
  }

  if (!b) return (
    <div className="why">
      <button type="button" className="btn small ghost" onClick={explain} disabled={busy}>{busy ? t("explaining") : t("explain")}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
  return (
    <details className="why" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><strong>{t("title")}</strong> <span className="stat-vs">{[b.hookFormula || b.hook.formula, b.hookScore != null ? t("hookScore", { score: b.hookScore }) : "", b.fromTranscript ? "" : t("noTranscript")].filter(Boolean).join(" · ")}</span></summary>
      <div className="why-body">
        <p><strong>{t("hook")}</strong> {b.hook.why}</p>
        {b.structure.length > 0 && <>
          <p><strong>{t("structure")}</strong></p>
          <ol className="why-structure">{b.structure.map((s, i) => <li key={i}><span className="badge">{t(`parts.${s.part}`)}</span>{s.timing && <code> {s.timing}</code>} {s.what}</li>)}</ol>
        </>}
        {b.retention.length > 0 && <p><strong>{t("retention")}</strong> {b.retention.join(" · ")}</p>}
        <p><strong>{t("cta")}</strong> {t(`ctaTypes.${b.cta.kind}`)}{b.cta.text ? `: “${b.cta.text}”` : ""}</p>
        {b.format && <p><strong>{t("format")}</strong> {b.format}</p>}
        {b.why_it_worked.length > 0 && <><p><strong>{t("whyWorked")}</strong></p><ul>{b.why_it_worked.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        {b.reuse.length > 0 && <><p><strong>{t("reuse")}</strong></p><ul>{b.reuse.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        <button type="button" className="btn small ghost" onClick={explain} disabled={busy}>{busy ? t("explaining") : t("again")}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </details>
  );
}

/** Explain the top posts that have no breakdown yet, one after the other, then refresh the profile. */
export function ExplainTopButton({ postIds, clientId, locale }: { postIds: string[]; clientId?: string; locale: string }) {
  const t = useTranslations("wins.why");
  const router = useRouter();
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function run() {
    setBusy(true); setFailed(false); setDone(0);
    for (const id of postIds) {
      const res = await fetch("/api/competitors/breakdown", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, postId: id, locale }) }).catch(() => null);
      if (!res?.ok) { setFailed(true); break; }
      setDone((n) => n + 1);
    }
    setBusy(false); router.refresh();
  }
  if (!postIds.length) return null;
  return (
    <div className="btn-row">
      <button type="button" className="btn small" onClick={run} disabled={busy}>{busy ? t("explainingN", { done, total: postIds.length }) : t("explainTop", { count: postIds.length })}</button>
      {failed && <span className="error" role="alert">{t("errors.batch")}</span>}
    </div>
  );
}
