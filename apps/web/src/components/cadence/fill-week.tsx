"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addWeekPostsAction, movePostAction } from "@/lib/cadence-actions";

type WeekPost = { date: string; format: string; title: string; hook: string; why: string };
const dayLabel = (locale: string, d: string) => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** "Fill the week": the agent proposes posts for the open days; the person keeps some and adds them to the calendar. */
export function FillWeek({ clientId, locale, network }: { clientId?: string; locale: string; network: string }) {
  const t = useTranslations("cadence");
  const tp = useTranslations("posts");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [posts, setPosts] = useState<WeekPost[] | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { if (!busy) return; setSeconds(0); const i = setInterval(() => setSeconds((s) => s + 1), 1000); return () => clearInterval(i); }, [busy]);
  const err = (code?: string) => (code && t.has(`fillErrors.${code}`) ? t(`fillErrors.${code}`) : t("fillErrors.generic"));

  async function ask() {
    setBusy(true); setError(null); setPosts(null);
    try {
      const res = await fetch("/api/posts/fill-week", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, network, locale }) });
      const data = (await res.json().catch(() => ({}))) as { posts?: WeekPost[]; error?: string };
      if (!res.ok || !data.posts) setError(err(data.error)); else { setPosts(data.posts); setKeep(data.posts.map(() => true)); }
    } catch { setError(err()); }
    finally { setBusy(false); }
  }
  const add = () => start(async () => {
    const chosen = (posts ?? []).filter((_, i) => keep[i]);
    if (!chosen.length) return;
    const r = await addWeekPostsAction({ clientId, network, language: locale, posts: chosen });
    if (r.ok) { setPosts(null); router.refresh(); } else setError(err(r.error));
  });

  return (
    <div className="fill-week">
      {!posts && (
        <div className="btn-row">
          <button type="button" className="btn small" onClick={ask} disabled={busy}>{busy ? t("filling") : t("fillWeek")}</button>
          {busy && <span className="stat-vs" role="status">{t("fillWait", { seconds })}</span>}
        </div>
      )}
      {posts && (
        <>
          <ul className="plain kickstart-plan">
            {posts.map((p, i) => (
              <li key={p.date}>
                <label className="kickstart-item">
                  <input type="checkbox" checked={keep[i] ?? true} onChange={(e) => setKeep((all) => all.map((v, j) => (j === i ? e.target.checked : v)))} />
                  <span className="kickstart-when">{dayLabel(locale, p.date)}</span>
                  <span className="kickstart-body">
                    <span className="badge">{tp.has(`formatCards.${p.format}.title`) ? tp(`formatCards.${p.format}.title`) : p.format}</span>{" "}
                    <strong>{p.title}</strong>{p.hook && <span className="stat-vs"> {p.hook}</span>}{p.why && <small>{p.why}</small>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button type="button" className="btn small" onClick={add} disabled={pending || !keep.some(Boolean)}>{t("addWeek", { count: keep.filter(Boolean).length })}</button>
            <button type="button" className="btn small ghost" onClick={ask} disabled={pending || busy}>{busy ? t("filling") : t("otherIdeas")}</button>
            <button type="button" className="btn small ghost" onClick={() => setPosts(null)} disabled={pending}>{t("cancel")}</button>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** A missed post: staff can move it to the next open day in one click. */
export function MoveButton({ clientId, postId, date, locale }: { clientId?: string; postId: string; date: string; locale: string }) {
  const t = useTranslations("cadence");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <button type="button" className="btn small ghost" disabled={pending} onClick={() => start(async () => { const r = await movePostAction({ clientId, postId, date }); if (r.ok) router.refresh(); else setFailed(true); })}>
      {failed ? t("moveFailed") : t("moveTo", { day: dayLabel(locale, date) })}
    </button>
  );
}
