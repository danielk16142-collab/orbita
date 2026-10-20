"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MAX_MEDIA_PER_POST, MAX_UPLOAD_BYTES, MEDIA_TYPES } from "@orbita/visuals";
import { createUploadUrlAction, deleteMediaAction, finalizeUploadAction } from "@/lib/visuals-actions";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type MediaItem = { id: string; kind: "image" | "video"; name: string | null; url: string; width: number | null; height: number | null };

/** Files made outside Orbita, on a post. Staff upload (straight to storage with a one-time signed URL, then the server verifies the file) and remove; everyone who can see the post sees them. */
export function MediaPanel({ postId, canEdit, items }: { postId: string; canEdit: boolean; items: MediaItem[] }) {
  const t = useTranslations("visuals.media");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const err = (e: string) => (t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.failed"));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    let room = MAX_MEDIA_PER_POST - items.length;
    try {
      for (const file of Array.from(files)) {
        if (room-- <= 0) { setError(err("too_many")); break; }
        if (!MEDIA_TYPES[file.type]) { setError(err("bad_type")); break; }
        if (file.size > MAX_UPLOAD_BYTES) { setError(err("too_big")); break; }
        setStatus(t("uploading", { name: file.name }));
        const a = await createUploadUrlAction({ postId, name: file.name, size: file.size, type: file.type });
        if (!a.ok || !a.path || !a.token) { setError(err(a.ok ? "failed" : a.error)); break; }
        const up = await supabaseBrowser().storage.from("post-media").uploadToSignedUrl(a.path, a.token, file, { contentType: file.type });
        if (up.error) { setError(err("upload_failed")); break; }
        const f = await finalizeUploadAction({ postId, path: a.path, name: file.name });
        if (!f.ok) { setError(err(f.error)); break; }
      }
    } catch { setError(err("upload_failed")); }
    finally { setBusy(false); setStatus(null); if (input.current) input.current.value = ""; router.refresh(); }
  }

  async function remove(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    setBusy(true); setError(null);
    const r = await deleteMediaAction({ mediaId: id });
    setBusy(false);
    if (r.ok) router.refresh(); else setError(err(r.error));
  }

  return (
    <section className="card media-panel" style={{ marginTop: "1.25rem" }} aria-labelledby="media-title">
      <div className="section-head">
        <h2 id="media-title">{t("title")}</h2>
        {canEdit && (
          <>
            <input ref={input} type="file" multiple hidden accept={Object.keys(MEDIA_TYPES).join(",")} onChange={(e) => void upload(e.target.files)} />
            <button type="button" className="btn small" disabled={busy || items.length >= MAX_MEDIA_PER_POST} onClick={() => input.current?.click()}>{t("upload")}</button>
          </>
        )}
      </div>
      {canEdit && <p className="stat-vs">{t("limits")}</p>}
      {status && <p role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {items.length === 0 ? <p className="stat-vs">{canEdit ? t("empty") : t("emptyClient")}</p> : (
        <ul className="visual-grid">
          {items.map((m) => (
            <li key={m.id} className="visual-item">
              {m.kind === "video"
                ? <video src={m.url} controls playsInline preload="metadata" aria-label={m.name ?? t("video")} />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={m.url} alt={m.name ?? t("image")} width={m.width ?? 1080} height={m.height ?? 1350} loading="lazy" />}
              <div className="btn-row">
                <a className="btn ghost small" href={m.url} download={m.name ?? undefined}>{t("download")}</a>
                {canEdit && <button type="button" className="btn ghost small" disabled={busy} onClick={() => void remove(m.id)}>{t("remove")}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
