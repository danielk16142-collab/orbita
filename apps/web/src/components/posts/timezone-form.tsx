"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setClientTimezoneAction } from "@/lib/posts-actions";

/** The client's timezone: planned times are read in it when posts are scheduled. */
export function TimezoneForm({ clientId, value }: { clientId: string; value: string }) {
  const t = useTranslations("posts");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="source-form" onSubmit={(e) => { e.preventDefault(); const tz = String(new FormData(e.currentTarget).get("tz") ?? ""); start(async () => { const r = await setClientTimezoneAction({ clientId, timezone: tz }); setMsg(r.ok ? t("saved") : t("errors.generic")); }); }}>
      <label>{t("timezone")}<input name="tz" defaultValue={value} list="tz-list" maxLength={64} style={{ padding: ".4rem", border: "2px solid var(--line)", borderRadius: 10, font: "inherit" }} /></label>
      <datalist id="tz-list">{["UTC", "Europe/Paris", "Europe/Madrid", "Europe/London", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Mexico_City", "America/Bogota", "America/Argentina/Buenos_Aires"].map((z) => <option key={z} value={z} />)}</datalist>
      <button className="btn small" disabled={pending}>{t("save")}</button>
      {msg && <span role="status">{msg}</span>}
    </form>
  );
}
