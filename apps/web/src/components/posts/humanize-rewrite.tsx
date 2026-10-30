"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { detectAi } from "@orbita/content";
import { fillPostCaptionAction } from "@/lib/posts-actions";

/** Have the agent rewrite the caption to sound more human. It shows the new version and its score; nothing is saved until you accept. */
export function HumanizeRewrite({ postId, caption }: { postId: string; caption: string }) {
  const t = useTranslations("postReview");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const fail = (code: string) => setError(t.has(`rewrite.errors.${code}`) ? t(`rewrite.errors.${code}`) : t("errors.generic"));
  async function run() {
    setBusy(true); setError(null); setText(null);
    try {
      const res = await fetch("/api/posts/humanize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId }) });
      const d = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !d.text) fail(d.error ?? "generic"); else setText(d.text);
    } catch { fail("generic"); }
    finally { setBusy(false); }
  }
  const accept = () => startSave(async () => {
    const r = await fillPostCaptionAction({ postId, caption: text });
    if (!r.ok) { fail(r.error); return; }
    setText(null); router.refresh();
  });
  const before = detectAi(caption).humanScore, after = text ? detectAi(text).humanScore : null;
  return (
    <div className="humanize-rewrite">
      <button type="button" className="btn small" disabled={busy} onClick={run}>{busy ? t("rewrite.working") : t("rewrite.button")}</button>
      {error && <span className="error" role="alert"> {error}</span>}
      {text && (
        <div className="rewrite-box">
          <p className="stat-vs">{t("rewrite.suggestion")} · {t("rewrite.scores", { before: Math.round(before), after: Math.round(after ?? 0) })}</p>
          <p className="feed-box pre">{text}</p>
          <div className="btn-row">
            <button type="button" className="btn small" disabled={saving} onClick={accept}>{t("rewrite.accept")}</button>
            <button type="button" className="btn ghost small" disabled={saving} onClick={() => setText(null)}>{t("rewrite.discard")}</button>
            <button type="button" className="btn ghost small" disabled={busy || saving} onClick={run}>{t("rewrite.again")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
