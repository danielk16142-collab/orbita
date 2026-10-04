"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addSourceAction, archiveMemoryAction, removeSourceAction } from "@/lib/agent-actions";

export function ArchiveMemoryButton({ id, clientId }: { id: string; clientId?: string }) {
  const t = useTranslations("agent"); const router = useRouter(); const [pending, start] = useTransition();
  return <button type="button" className="btn ghost small" disabled={pending} onClick={() => start(async () => { await archiveMemoryAction({ clientId, id }); router.refresh(); })}>{t("archive")}</button>;
}

export function RemoveSourceButton({ id, clientId }: { id: string; clientId?: string }) {
  const t = useTranslations("agent"); const router = useRouter(); const [pending, start] = useTransition();
  return <button type="button" className="btn ghost small" disabled={pending} onClick={() => start(async () => { await removeSourceAction({ clientId, id }); router.refresh(); })}>{t("remove")}</button>;
}

const KINDS = ["website", "instagram", "tiktok", "linkedin", "youtube", "facebook", "other"];
export function AddSourceForm({ clientId }: { clientId?: string }) {
  const t = useTranslations("agent"); const router = useRouter(); const [pending, start] = useTransition();
  const [kind, setKind] = useState("website"); const [value, setValue] = useState(""); const [error, setError] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault(); setError(false);
    const isUrl = /^https?:\/\//i.test(value.trim());
    start(async () => {
      const r = await addSourceAction({ clientId, kind, url: isUrl ? value.trim() : "", handle: isUrl ? "" : value.trim().replace(/^@/, "") });
      if (r.ok) { setValue(""); router.refresh(); } else setError(true);
    });
  }
  return (
    <form onSubmit={submit} className="source-form">
      <select aria-label={t("sourceKind")} value={kind} onChange={(e) => setKind(e.target.value)} style={{ padding: ".5rem", border: "2px solid var(--line)", borderRadius: 10 }}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
      <input aria-label={t("sourceValue")} placeholder={t("sourceValue")} value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} required style={{ padding: ".5rem", border: "2px solid var(--line)", borderRadius: 10, flex: 1, minWidth: 0 }} />
      <button className="btn small" disabled={pending}>{t("add")}</button>
      {error && <p className="error" role="alert">{t("sourceInvalid")}</p>}
    </form>
  );
}
