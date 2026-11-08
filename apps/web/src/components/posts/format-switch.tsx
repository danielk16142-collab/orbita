"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { changePostFormatAction } from "@/lib/posts-actions";
import { postError } from "./shared";

const FORMATS = ["reel", "carousel", "static", "story", "video", "text"] as const;

/** Change a planned post's format, whatever was suggested. Its script is replaced when it does not fit the new format. */
export function FormatSwitch({ postId, current, hasContent = true, compact = false }: { postId: string; current: string; hasContent?: boolean; compact?: boolean }) {
  const t = useTranslations("posts");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const change = (type: string) => {
    if (type === current || pending) return;
    if (hasContent && !window.confirm(t("format.confirm", { format: t(`formatCards.${type}.title`) }))) return;
    start(async () => {
      setNote(null);
      const r = await changePostFormatAction({ postId, type });
      if (r.ok) { setNote({ ok: true, text: r.cleared ? t("format.cleared", { format: t(`formatCards.${type}.title`) }) : t("format.changed") }); router.refresh(); }
      else setNote({ ok: false, text: postError(t, r) });
    });
  };
  if (compact) return (
    <span className="format-switch compact">
      <label className="sr-only" htmlFor={`fmt-${postId}`}>{t("format.label")}</label>
      <select id={`fmt-${postId}`} value={current} disabled={pending} onChange={(e) => change(e.target.value)}>
        {FORMATS.map((f) => <option key={f} value={f}>{t(`formatCards.${f}.title`)}</option>)}
        {!(FORMATS as readonly string[]).includes(current) && <option value={current}>{current}</option>}
      </select>
      {note && !note.ok && <span className="error" role="alert">{note.text}</span>}
    </span>
  );
  return (
    <div className="format-switch">
      <span className="eyebrow">{t("format.label")}</span>
      <div className="format-chips" role="group" aria-label={t("format.label")}>
        {FORMATS.map((f) => <button key={f} type="button" className="map-topic" aria-pressed={f === current} disabled={pending} onClick={() => change(f)}>{t(`formatCards.${f}.title`)}</button>)}
      </div>
      {note && <p className={note.ok ? "ok" : "error"} role="status">{note.text}</p>}
    </div>
  );
}
