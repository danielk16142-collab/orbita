"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cleanPostTextAction } from "@/lib/posts-actions";

/** Runs the humanizer over the post's caption and text. */
export function CleanTextButton({ postId, disabled }: { postId: string; disabled?: boolean }) {
  const t = useTranslations("postReview");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = () => start(async () => {
    setError(null); setNote(null);
    const r = await cleanPostTextAction({ postId });
    if (!r.ok) { setError(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic")); return; }
    setNote(r.removed ? t("cleaned", { count: r.removed }) : t("nothingToClean"));
    router.refresh();
  });
  return (
    <div className="review-clean">
      <button type="button" className="btn small" disabled={pending || disabled} onClick={run}>{pending ? t("cleaning") : t("clean")}</button>
      {note && <span className="stat-vs" role="status">{note}</span>}
      {error && <span className="error" role="alert">{error}</span>}
    </div>
  );
}
