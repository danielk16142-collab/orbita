"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Kickstart } from "@orbita/agent";
import { acceptKickstartAction, dismissKickstartAction } from "@/lib/kickstart-actions";
import { NETWORK_LABEL } from "@/components/posts/shared";

const day = (start: string, offset: number) => new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000);

/**
 * The kickstart for a newly connected account. Before it exists: one button builds it (about a minute). Once ready: the read
 * of the account, the rhythm, and two weeks of posts; the person keeps the ones they want and accepts them onto the calendar.
 */
export function KickstartPanel({ clientId, locale, network, handle, accountId, ready, calendarHref }: {
  clientId?: string; locale: string; network: string; handle: string | null; accountId: string; calendarHref: string;
  ready: { id: string; startDate: string; plan: Kickstart } | null;
}) {
  const t = useTranslations("kickstart");
  const tp = useTranslations("posts");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [keep, setKeep] = useState<boolean[]>(() => ready?.plan.plan.map(() => true) ?? []);
  const [setGoal, setSetGoal] = useState(true);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { if (!busy) return; setSeconds(0); const i = setInterval(() => setSeconds((s) => s + 1), 1000); return () => clearInterval(i); }, [busy]);
  const name = `${NETWORK_LABEL[network] ?? network}${handle ? ` @${handle}` : ""}`;
  const errorText = (code?: string) => (code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));

  async function build() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/kickstart/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, accountId, locale }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(errorText(data.error)); else router.refresh();
    } catch { setError(errorText()); }
    finally { setBusy(false); }
  }

  if (done !== null) return <section className="card kickstart"><p className="ok">✓ {t("accepted", { count: done })}</p>
    <div className="btn-row"><a className="btn" href={calendarHref}>{t("openCalendar")}</a><button type="button" className="btn ghost" onClick={() => router.refresh()}>{t("seeNext")}</button></div></section>;

  if (!ready) return (
    <section className="card kickstart" aria-labelledby="ks-h">
      <p className="eyebrow">{t("eyebrow")}</p>
      <h2 id="ks-h">{t("buildTitle", { name })}</h2>
      <p>{t("buildText")}</p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={build} disabled={busy}>{busy ? t("building") : t("build")}</button>
        {busy && <span className="stat-vs" role="status">{t("wait", { seconds })}</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );

  const k = ready.plan;
  const dateF = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const chosen = keep.filter(Boolean).length;
  const accept = () => start(async () => {
    setError(null);
    const r = await acceptKickstartAction({ clientId, id: ready.id, items: keep.flatMap((v, i) => (v ? [i] : [])), language: locale, setGoal });
    if (r.ok) setDone(r.added ?? 0); else setError(errorText(r.error));
  });
  const dismiss = () => start(async () => { const r = await dismissKickstartAction({ clientId, id: ready.id }); if (r.ok) router.refresh(); else setError(errorText(r.error)); });

  return (
    <section className="card kickstart" aria-labelledby="ks-h">
      <p className="eyebrow">{t("eyebrow")}</p>
      <h2 id="ks-h">{t("readyTitle", { name })}</h2>
      <p className="lead">{k.summary}</p>
      <div className="info-grid three">
        {k.working.length > 0 && <div><h3>{t("working")}</h3><ul>{k.working.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {k.gaps.length > 0 && <div><h3>{t("gaps")}</h3><ul>{k.gaps.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        <div>
          <h3>{t("rhythm")}</h3>
          <p><strong>{t("perWeek", { count: k.posts_per_week })}</strong></p>
          {k.best_formats.length > 0 && <ul>{k.best_formats.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {k.best_times && <p className="stat-vs">{k.best_times}</p>}
        </div>
      </div>

      <h3>{t("planTitle")}</h3>
      <ul className="plain kickstart-plan">
        {k.plan.map((it, i) => (
          <li key={i}>
            <label className="kickstart-item">
              <input type="checkbox" checked={keep[i] ?? true} onChange={(e) => setKeep((all) => all.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span className="kickstart-when">{dateF.format(day(ready.startDate, it.day_offset))}</span>
              <span className="kickstart-body">
                <span className="badge">{tp.has(`formatCards.${it.format}.title`) ? tp(`formatCards.${it.format}.title`) : it.format}</span>{" "}
                <strong>{it.title}</strong>
                {it.hook && <span className="stat-vs"> {t("hook")} {it.hook}</span>}
                {it.why && <small>{it.why}</small>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="check-line"><input type="checkbox" checked={setGoal} onChange={(e) => setSetGoal(e.target.checked)} /> {t("setGoal", { count: k.posts_per_week })}</label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="btn-row">
        <button type="button" className="btn" onClick={accept} disabled={pending}>{t("accept", { count: chosen })}</button>
        <button type="button" className="btn ghost" onClick={build} disabled={pending || busy}>{busy ? t("building") : t("rebuild")}</button>
        <button type="button" className="btn ghost" onClick={dismiss} disabled={pending}>{t("dismiss")}</button>
      </div>
      <small>{t("acceptHint")}</small>
    </section>
  );
}
