"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Result = { summary: string; filled: string[]; colors: string[]; questions: string[]; pages: number; pageErrors: number };

/**
 * "Getting to know the business": the first audit. It starts by itself right after a business is added with its links
 * (autoStart), or with the button when none was done yet. Afterwards the brand profile, colours and the agent's first
 * questions come from it.
 */
export function FirstAuditCard({ clientId, locale, autoStart, agentHref, profileHref, done }: { clientId: string; locale: string; autoStart: boolean; agentHref: string; profileHref: string; done: { summary: string; questions: string[] } | null }) {
  const t = useTranslations("firstAudit");
  const ta = useTranslations("agent");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/clients/first-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, locale }) });
      const data = (await res.json().catch(() => ({ error: res.status === 504 ? "timeout" : "generic" }))) as Partial<Result> & { error?: string; detail?: string };
      if (!res.ok || !data.summary) { const c = data.error ?? "generic"; const m = t.has(`errors.${c}`) ? t(`errors.${c}`) : ta.has(`errors.${c}`) ? ta(`errors.${c}`) : ta("errors.generic"); setError(data.detail ? `${m} (${data.detail})` : m); return; }
      setResult(data as Result); router.refresh();
    } catch { setError(ta("errors.generic")); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (autoStart && !done && !started.current) { started.current = true; void run(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = result ?? (done ? { summary: done.summary, questions: done.questions, filled: [], colors: [], pages: 0, pageErrors: 0 } : null);
  return (
    <section className="card first-audit" aria-live="polite">
      <h2>{t("title")}</h2>
      {busy && <><p>{t("working")}</p><ol className="first-audit-steps"><li>{t("step1")}</li><li>{t("step2")}</li><li>{t("step3")}</li></ol><p className="stat-vs">{t("wait")}</p></>}
      {!busy && !shown && <><p className="stat-vs">{t("intro")}</p><button type="button" className="btn" onClick={run}>{t("run")}</button></>}
      {error && <p className="error" role="alert">{error}</p>}
      {!busy && shown && (
        <div className="first-audit-result">
          <p>{shown.summary}</p>
          {result && (
            <ul className="plain first-audit-facts">
              <li>{t("pagesRead", { count: result.pages })}{result.pageErrors ? ` · ${t("pagesFailed", { count: result.pageErrors })}` : ""}</li>
              {result.filled.length > 0 && <li>{t("filled", { count: result.filled.length })}</li>}
              {result.colors.length > 0 && <li className="first-audit-colors">{t("colors")} {result.colors.map((c) => <span key={c} className="swatch" style={{ background: c }} title={c} />)}</li>}
            </ul>
          )}
          {shown.questions.length > 0 && <><h3>{t("questions")}</h3><ol>{shown.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></>}
          <div className="btn-row">
            <Link className="btn" href={agentHref}>{t("answer")}</Link>
            <Link className="btn ghost small" href={profileHref}>{t("seeProfile")}</Link>
          </div>
        </div>
      )}
    </section>
  );
}
