"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createPostAction } from "@/lib/posts-actions";
import { NETWORK_COLOR, NETWORK_LABEL } from "./shared";

/** Formats offered when creating a post, and where each one can go. */
export const FORMAT_NETWORKS: Record<string, string[]> = {
  reel: ["instagram", "tiktok", "youtube", "facebook"],
  carousel: ["instagram", "linkedin", "facebook", "tiktok"],
  static: ["instagram", "facebook", "linkedin"],
  story: ["instagram", "facebook"],
  video: ["youtube", "facebook", "linkedin", "tiktok"],
  text: ["linkedin", "facebook"],
  article: ["linkedin"],
};
const FORMATS = Object.keys(FORMAT_NETWORKS);
const LANGS = ["en", "fr", "es"];
const STEPS = ["format", "where", "details"] as const;

/** Small line icons for the format cards (decorative). */
function FormatIcon({ format }: { format: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const shapes: Record<string, React.ReactNode> = {
    reel: <><rect x="6" y="3" width="12" height="18" rx="2" {...p} /><path d="M10.5 9.5v5l4-2.5z" {...p} /></>,
    carousel: <><rect x="7" y="5" width="10" height="14" rx="1.5" {...p} /><path d="M4 7v10M20 7v10" {...p} /></>,
    static: <><rect x="4" y="4" width="16" height="16" rx="2" {...p} /><circle cx="9" cy="9" r="1.6" {...p} /><path d="M20 16l-5-5-8 9" {...p} /></>,
    story: <><rect x="7" y="2.5" width="10" height="19" rx="2" {...p} /><path d="M9 5.5h6" {...p} /></>,
    video: <><rect x="3" y="6" width="18" height="12" rx="2" {...p} /><path d="M10.5 9.5v5l4-2.5z" {...p} /></>,
    text: <path d="M5 6h14M5 10h14M5 14h9M5 18h11" {...p} />,
    article: <><rect x="5" y="3" width="14" height="18" rx="1.5" {...p} /><path d="M8 7h8M8 11h8M8 15h5" {...p} /></>,
  };
  return <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">{shapes[format]}</svg>;
}

/**
 * Create a post in three steps: what (format), where (networks), then the details. The person either creates it as an idea
 * or draft and fills it in, or hands it to the agent, which opens the chat with the request prepared (nothing is sent automatically).
 */
export function CreatePostFlow({ locale, staff, clients, initialClient, initialDate, postsBase, agentBase }: {
  locale: string; staff: boolean; clients: { id: string; name: string }[]; initialClient: string; initialDate: string;
  /** e.g. /en/posts or /en/portal/posts */ postsBase: string;
  /** e.g. /en/agent (staff, the client id is added) or /en/portal/agent */ agentBase: string;
}) {
  const t = useTranslations("posts");
  const router = useRouter();
  const [step, setStep] = useState<(typeof STEPS)[number]>("format");
  const [format, setFormat] = useState<string | null>(null);
  const [networks, setNetworks] = useState<string[]>([]);
  const [clientId, setClientId] = useState(initialClient || clients[0]?.id || "");
  const [language, setLanguage] = useState(LANGS.includes(locale) ? locale : "en");
  const [idea, setIdea] = useState("");
  const [date, setDate] = useState(initialDate);
  const [status, setStatus] = useState<"idea" | "draft">(staff ? "draft" : "idea");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const chooseFormat = (f: string) => { setFormat(f); setNetworks((n) => n.filter((x) => FORMAT_NETWORKS[f].includes(x))); setStep("where"); };
  const toggle = (n: string) => setNetworks((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
  const stepIndex = STEPS.indexOf(step);

  function create() {
    setError(null);
    if (!format || !networks.length || !idea.trim() || (staff && !clientId)) { setError(t("errors.bad_request")); return; }
    start(async () => {
      const ids: string[] = [];
      for (const network of networks) {
        const r = await createPostAction({ clientId: staff ? clientId : undefined, network, language, type: format, idea, planned_date: date || null, status });
        if (!r.ok) { setError(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic")); return; }
        if (r.id) ids.push(r.id);
      }
      router.push(ids.length === 1 ? `${postsBase}/${ids[0]}` : `${postsBase}?${new URLSearchParams({ view: "month", ...(date && { date }) })}`);
    });
  }
  function withAgent() {
    if (!format || !networks.length) return;
    const q = new URLSearchParams({ ...(staff && { client: clientId }), view: "chat", ask: "draft", format, network: networks.join(","), ...(idea.trim() && { idea: idea.trim().slice(0, 500) }) });
    router.push(`${agentBase}?${q}`);
  }

  return (
    <div className="flow">
      <ol className="steps" aria-label={t("steps")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={i < stepIndex ? "done" : undefined}>
            {i < stepIndex ? <button type="button" onClick={() => setStep(s)}><span className="step-num">{i + 1}</span>{t(`stepNames.${s}`)}</button> : <span><span className="step-num">{i + 1}</span>{t(`stepNames.${s}`)}</span>}
          </li>
        ))}
      </ol>

      {step === "format" && (
        <section aria-labelledby="h-format">
          <h2 id="h-format">{t("whatTitle")}</h2>
          <div className="choice-grid">
            {FORMATS.map((f) => (
              <button key={f} type="button" className="choice" aria-pressed={format === f} onClick={() => chooseFormat(f)}>
                <FormatIcon format={f} />
                <strong>{t(`formatCards.${f}.title`)}</strong>
                <span>{t(`formatCards.${f}.text`)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "where" && format && (
        <section aria-labelledby="h-where">
          <h2 id="h-where">{t("whereTitle")}</h2>
          <p className="stat-vs">{t("whereHint", { format: t(`formatCards.${format}.title`) })}</p>
          <div className="choice-grid networks">
            {FORMAT_NETWORKS[format].map((n) => (
              <button key={n} type="button" className="choice network" aria-pressed={networks.includes(n)} onClick={() => toggle(n)}>
                <span className="net-dot" style={{ background: NETWORK_COLOR[n] }} aria-hidden="true" />
                <strong>{NETWORK_LABEL[n]}</strong>
                <span className="check-mark" aria-hidden="true">{networks.includes(n) ? "✓" : ""}</span>
              </button>
            ))}
          </div>
          <div className="btn-row flow-nav">
            <button type="button" className="btn ghost" onClick={() => setStep("format")}>{t("back")}</button>
            <button type="button" className="btn" disabled={!networks.length} onClick={() => setStep("details")}>{t("nextStep")}</button>
          </div>
        </section>
      )}

      {step === "details" && format && (
        <section aria-labelledby="h-details" className="card flow-details">
          <h2 id="h-details">{t("detailsTitle")}</h2>
          <p className="flow-summary">
            <span className="badge">{t(`formatCards.${format}.title`)}</span>
            {networks.map((n) => <span key={n} className="badge"><span className="net-dot small" style={{ background: NETWORK_COLOR[n] }} aria-hidden="true" />{NETWORK_LABEL[n]}</span>)}
          </p>
          {staff && (
            <label>{t("client")}
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
          )}
          <label>{t("ideaLabel")}
            <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={4} maxLength={2000} placeholder={t("ideaPlaceholder")} />
          </label>
          <div className="plan-row">
            <label>{t("language")}<select value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></label>
            <label>{t("date")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            {staff && <label>{t("status")}<select value={status} onChange={(e) => setStatus(e.target.value as "idea" | "draft")}><option value="draft">{t("statuses.draft")}</option><option value="idea">{t("statuses.idea")}</option></select></label>}
          </div>
          {networks.length > 1 && <p className="stat-vs">{t("onePerNetwork", { count: networks.length })}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="flow-actions">
            <div className="flow-option">
              <button type="button" className="btn" onClick={withAgent} disabled={pending || (staff && !clientId)}>{t("writeWithAgent")}</button>
              <small>{t("writeWithAgentHint")}</small>
            </div>
            <div className="flow-option">
              <button type="button" className="btn ghost" onClick={create} disabled={pending || !idea.trim()}>{staff ? t("createDraft") : t("createIdea")}</button>
              <small>{t("createHint")}</small>
            </div>
          </div>
          <button type="button" className="btn ghost small" onClick={() => setStep("where")}>{t("back")}</button>
        </section>
      )}
    </div>
  );
}
