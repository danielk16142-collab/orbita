"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addCommentAction, deletePostAction, setStatusAction } from "@/lib/posts-actions";

/** Status buttons (only the moves this role may make), comment box, and delete for staff. */
export function PostActions({ postId, moves, requireComment, staff, listHref }: { postId: string; moves: string[]; requireComment: string[]; staff: boolean; listHref: string }) {
  const t = useTranslations("posts");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const msg = (e: string) => (t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic"));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setError(null); const r = await fn();
    if (r.ok) { after?.(); router.refresh(); } else setError(msg(r.error ?? "generic"));
  });
  return (
    <div className="post-actions">
      {moves.length > 0 && (
        <div className="status-moves">
          {requireComment.length > 0 && <label>{t("commentLabel")}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} /></label>}
          <div className="agent-actions">
            {moves.map((s) => (
              <button key={s} type="button" disabled={pending} className={`btn small ${s === "approved" ? "" : "ghost"}`}
                onClick={() => run(() => setStatusAction({ postId, status: s, comment: requireComment.includes(s) ? note : undefined }), () => setNote(""))}>{t(`moves.${s}`)}</button>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; const body = String(new FormData(form).get("body") ?? ""); run(() => addCommentAction({ postId, body }), () => form.reset()); }} className="comment-form">
        <label>{t("addComment")}<textarea name="body" required rows={2} maxLength={2000} /></label>
        <button className="btn small" disabled={pending}>{t("send")}</button>
      </form>
      {staff && <button type="button" className="btn ghost small" disabled={pending} onClick={() => { if (confirm(t("confirmDelete"))) run(() => deletePostAction({ postId }), () => router.push(listHref)); }}>{t("deletePost")}</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
