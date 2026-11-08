"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ChannelAudit } from "@orbita/agent";
import { fetchTikTokStatsAction, uploadLinkedInExportAction } from "@/lib/channel-stats-actions";

function useErr() {
  const t = useTranslations("channels");
  return (r: { error?: string; detail?: string }) => { const c = r.error ?? "generic"; const m = t.has(`errors.${c}`) ? t(`errors.${c}`) : t("errors.generic"); return r.detail ? `${m} (${r.detail})` : m; };
}

/** TikTok: fetch the latest videos now (staff). */
export function FetchTikTokButton({ clientId, again }: { clientId?: string; again: boolean }) {
  const t = useTranslations("channels.tiktok");
  const err = useErr();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="channel-action">
      <button type="button" className={again ? "btn small ghost" : "btn small"} disabled={pending} onClick={() => start(async () => { setError(null); const r = await fetchTikTokStatsAction({ clientId }); if (r.ok) router.refresh(); else setError(err(r)); })}>
        {pending ? t("fetching") : again ? t("refresh") : t("fetch")}
      </button>
      {pending && <span className="stat-vs">{t("fetchingHint")}</span>}
      {error && <span className="error" role="alert">{error}</span>}
    </span>
  );
}

/** LinkedIn: upload the analytics file exported from LinkedIn. */
export function LinkedInUpload({ clientId, again }: { clientId?: string; again: boolean }) {
  const t = useTranslations("channels.linkedin");
  const err = useErr();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="channel-upload" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (clientId) f.set("clientId", clientId); start(async () => { setError(null); const r = await uploadLinkedInExportAction(f); if (r.ok) { (e.target as HTMLFormElement).reset(); router.refresh(); } else setError(err(r)); }); }}>
      <label>{again ? t("uploadNew") : t("upload")}<input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label>
      <button type="submit" className="btn small" disabled={pending}>{pending ? t("reading") : t("send")}</button>
      {error && <span className="error" role="alert">{error}</span>}
    </form>
  );
}

/** The agent's audit of the latest snapshot, or a button to run it. */
export function ChannelAuditPanel({ clientId, statsId, locale, initial, auditedAt }: { clientId?: string; statsId: string; locale: string; initial: ChannelAudit | null; auditedAt: string | null }) {
  const t = useTranslations("channels.audit");
  const err = useErr();
  const router = useRouter();
  const [a, setA] = useState<ChannelAudit | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/channels/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, id: statsId, locale }) });
      const data = (await res.json().catch(() => ({ error: res.status === 504 ? "timeout" : "generic" }))) as { audit?: ChannelAudit; error?: string; detail?: string };
      if (data.audit) { setA(data.audit); router.refresh(); } else setError(err(data));
    } catch { setError(err({})); }
    finally { setBusy(false); }
  }
  return (
    <div className="channel-audit">
      <div className="btn-row">
        <button type="button" className={a ? "btn small ghost" : "btn small"} onClick={run} disabled={busy}>{busy ? t("running") : a ? t("again") : t("run")}</button>
        {busy && <span className="stat-vs">{t("runningHint")}</span>}
        {a && auditedAt && !busy && <span className="stat-vs">{t("on", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(auditedAt)) })}</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {a && (
        <div className="channel-audit-body">
          <p className="channel-verdict">{a.verdict}</p>
          <div className="channel-audit-cols">
            {a.working.length > 0 && <div><h4>{t("working")}</h4><ul>{a.working.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {a.not_working.length > 0 && <div><h4>{t("notWorking")}</h4><ul>{a.not_working.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          </div>
          {a.recommendations.length > 0 && <>
            <h4>{t("recommendations")}</h4>
            <ol className="channel-recs">{a.recommendations.map((r, i) => <li key={i}><strong>{r.title}</strong><span className="stat-vs block">{r.why}</span><span className="block">{r.how}</span></li>)}</ol>
          </>}
          {a.this_week.length > 0 && <><h4>{t("thisWeek")}</h4><ul>{a.this_week.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        </div>
      )}
    </div>
  );
}
