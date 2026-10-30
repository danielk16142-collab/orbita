"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { COMPETITOR_NETWORKS } from "@/lib/competitors";
import { addCompetitorPostAction, addCompetitorPostsBulkAction, removeCompetitorPostAction } from "@/lib/competitor-posts-actions";

const LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", facebook: "Facebook" };

/** Record a post that is working for a competitor: one at a time with the details, or several pasted at once. */
export function AddWinForm({ clientId, competitorId }: { clientId?: string; competitorId: string }) {
  const t = useTranslations("wins");
  const router = useRouter();
  const [mode, setMode] = useState<"one" | "bulk" | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fail = (e: string) => setError(t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));
  if (!mode) return <div className="btn-row"><button type="button" className="btn" onClick={() => setMode("one")}>+ {t("addOne")}</button><button type="button" className="btn ghost" onClick={() => setMode("bulk")}>{t("addBulk")}</button></div>;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setDone(null);
    const form = e.currentTarget; const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    start(async () => {
      const r = mode === "bulk" ? await addCompetitorPostsBulkAction({ clientId, competitorId, network: d.network, text: d.text }) : await addCompetitorPostAction({ clientId, competitorId, ...d });
      if (!r.ok) { fail(r.error); return; }
      setDone(t("saved", { count: r.count ?? 1 })); form.reset(); router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="card win-form">
      <h3>{mode === "bulk" ? t("addBulk") : t("addOne")}</h3>
      <label>{t("network")}<select name="network" defaultValue="instagram">{COMPETITOR_NETWORKS.map((n) => <option key={n} value={n}>{LABEL[n]}</option>)}</select></label>
      {mode === "bulk" ? (
        <label>{t("bulkLabel")}<textarea name="text" required rows={6} maxLength={20000} placeholder={t("bulkPlaceholder")} /></label>
      ) : (
        <>
          <label>{t("hook")}<input name="hook" required maxLength={300} placeholder={t("hookPlaceholder")} /></label>
          <label>{t("url")}<input name="url" type="url" maxLength={500} placeholder="https://" /></label>
          <div className="link-grid">
            <label>{t("views")}<input name="views" inputMode="numeric" /></label><label>{t("likes")}<input name="likes" inputMode="numeric" /></label>
            <label>{t("comments")}<input name="comments" inputMode="numeric" /></label><label>{t("shares")}<input name="shares" inputMode="numeric" /></label>
          </div>
          <label>{t("transcript")}<textarea name="transcript" rows={3} maxLength={8000} placeholder={t("transcriptPlaceholder")} /></label>
        </>
      )}
      <p className="stat-vs">{t("hint")}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="stat-vs" role="status">✓ {done}</p>}
      <div className="btn-row"><button className="btn" disabled={pending}>{t("save")}</button><button type="button" className="btn ghost" onClick={() => setMode(null)}>{t("close")}</button></div>
    </form>
  );
}

export function RemoveWinButton({ clientId, id }: { clientId?: string; id: string }) {
  const t = useTranslations("wins");
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="btn ghost small" disabled={pending} onClick={() => { if (confirm(t("removeConfirm"))) start(async () => { const r = await removeCompetitorPostAction({ clientId, id }); if (r.ok) router.refresh(); }); }}>{t("remove")}</button>;
}
