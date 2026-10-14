"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { archiveStrategyAction } from "@/lib/focus-actions";

/** Archive the active strategy (kept for the record) so a new one can be built. Asks first. */
export function ArchiveStrategyButton({ clientId }: { clientId?: string }) {
  const t = useTranslations("strategyPage");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <>
      <button type="button" className="btn small ghost" disabled={pending} onClick={() => {
        if (!window.confirm(t("archiveConfirm"))) return;
        start(async () => { const r = await archiveStrategyAction({ clientId }); if (r.ok) router.refresh(); else setError(true); });
      }}>{pending ? t("archiving") : t("archive")}</button>
      {error && <span className="error" role="alert">{t("archiveFailed")}</span>}
    </>
  );
}
