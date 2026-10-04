"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { disconnectAccountAction, refreshAccountAction } from "@/lib/connections-actions";

export function AccountActions({ accountId, clientId }: { accountId: string; clientId?: string }) {
  const t = useTranslations("connections");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const run = (fn: typeof refreshAccountAction, done: string | null) => start(async () => {
    setMsg(null);
    const r = await fn({ clientId, accountId });
    if (r.ok) { if (done) setMsg(done); router.refresh(); } else setMsg(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.failed"));
  });
  return (
    <div className="conn-actions">
      <button type="button" className="btn ghost small" disabled={pending} onClick={() => run(refreshAccountAction, t("refreshed"))}>{pending ? t("working") : t("refresh")}</button>
      {!confirm ? <button type="button" className="btn ghost small" disabled={pending} onClick={() => setConfirm(true)}>{t("disconnect")}</button> : (
        <span role="group" aria-label={t("confirmDisconnect")}>
          <small>{t("confirmDisconnect")}</small>{" "}
          <button type="button" className="btn small" disabled={pending} onClick={() => run(disconnectAccountAction, null)}>{t("yesDisconnect")}</button>{" "}
          <button type="button" className="btn ghost small" onClick={() => setConfirm(false)}>{t("cancel")}</button>
        </span>
      )}
      {msg && <p role="status" className="conn-msg">{msg}</p>}
    </div>
  );
}
