"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createPostAction } from "@/lib/posts-actions";

const NETWORKS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"], TYPES = ["reel", "carousel", "static", "story", "video", "text", "article", "post"], LANGS = ["en", "fr", "es"];
const f = { padding: ".5rem", border: "2px solid var(--line)", borderRadius: 10, font: "inherit", background: "#fff", color: "var(--ink)", width: "100%" } as const;

/** Quick add. Clients add ideas; staff choose idea or draft and the client. */
export function NewPostForm({ locale, clients, staff, postHref, defaultDate }: { locale: string; clients: { id: string; name: string }[]; staff: boolean; postHref: (id: string) => string; defaultDate: string }) {
  const t = useTranslations("posts");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const d = new FormData(e.currentTarget);
    start(async () => {
      const r = await createPostAction({ clientId: staff ? String(d.get("clientId")) : undefined, network: d.get("network"), language: d.get("language"), type: d.get("type"), idea: d.get("idea"), planned_date: d.get("date") || null, status: staff ? d.get("status") : "idea" });
      if (r.ok && r.id) router.push(postHref(r.id)); else setError(t.has(`errors.${r.ok ? "generic" : r.error}`) ? t(`errors.${r.ok ? "generic" : r.error}`) : t("errors.generic"));
    });
  }
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>{t("newPost")}</button>;
  return (
    <form onSubmit={submit} className="card new-post">
      <h2>{staff ? t("newPost") : t("newIdea")}</h2>
      {staff && <label>{t("client")}<select name="clientId" required style={f}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      <div className="plan-row">
        <label>{t("network")}<select name="network" style={f}>{NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>{t("format")}<select name="type" style={f} defaultValue="reel">{TYPES.map((x) => <option key={x} value={x}>{t(`formats.${x}`)}</option>)}</select></label>
        <label>{t("language")}<select name="language" style={f} defaultValue={locale}>{LANGS.map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></label>
      </div>
      <label>{t("idea")}<textarea name="idea" required rows={3} maxLength={2000} style={f} /></label>
      <div className="plan-row">
        <label>{t("date")}<input type="date" name="date" defaultValue={defaultDate} style={f} /></label>
        {staff && <label>{t("status")}<select name="status" style={f}><option value="idea">{t("statuses.idea")}</option><option value="draft">{t("statuses.draft")}</option></select></label>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="proposal-actions"><button className="btn" disabled={pending}>{t("create")}</button><button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t("cancel")}</button></div>
    </form>
  );
}
