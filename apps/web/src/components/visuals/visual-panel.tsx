"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createVisualAction } from "@/lib/visuals-actions";

export type VisualImage = { page: number; width: number | null; height: number | null; url: string };
export type VisualJob = { id: string; status: string; pages: number | null; errorCode: string | null; percent?: number | null; images: VisualImage[] };

const TERMINAL = ["succeeded", "failed", "canceled"];
const POLL_MS = 3000, MAX_FINISH_POLLS = 10;

/**
 * Images for a carousel or static post. Staff can create (or create again) while the module is on; everyone who can see the
 * post sees the result. While a job runs the panel asks the server for its status every few seconds: the server asks Moda,
 * stores the finished images, and the panel shows them.
 */
export function VisualPanel({ postId, canCreate, initial, used, cap }: { postId: string; canCreate: boolean; initial: VisualJob | null; used: number; cap: number }) {
  const t = useTranslations("visuals");
  const router = useRouter();
  const [job, setJob] = useState<VisualJob | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishPolls = useRef(0);
  const err = (e: string) => (t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.failed"));

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/visuals/${id}`, { cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as VisualJob; setJob(j);
        const finishing = j.status === "succeeded" && j.images.length < (j.pages ?? 1) && finishPolls.current++ < MAX_FINISH_POLLS;
        if (!TERMINAL.includes(j.status) || finishing) { timer.current = setTimeout(() => void poll(id), POLL_MS); return; }
        router.refresh(); return;
      }
      if (res.status === 429) { timer.current = setTimeout(() => void poll(id), POLL_MS * 3); return; }
      setError(err("failed"));
    } catch { timer.current = setTimeout(() => void poll(id), POLL_MS * 2); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (job && (!TERMINAL.includes(job.status) || (job.status === "succeeded" && job.images.length < (job.pages ?? 1)))) { finishPolls.current = 0; void poll(job.id); }
    return () => { if (timer.current) clearTimeout(timer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function create() {
    setError(null);
    start(async () => {
      const r = await createVisualAction({ postId });
      if (!r.ok) { setError(err(r.error)); return; }
      finishPolls.current = 0; setJob({ id: r.jobId!, status: "queued", pages: null, errorCode: null, images: [] }); void poll(r.jobId!);
    });
  }

  const running = !!job && !TERMINAL.includes(job.status);
  const finishing = !!job && job.status === "succeeded" && job.images.length < (job.pages ?? 1);
  const failed = !!job && (job.status === "failed" || job.status === "canceled");
  const done = !!job && job.status === "succeeded" && job.images.length > 0;
  const atCap = used >= cap;

  return (
    <section className="card visual-panel" style={{ marginTop: "1.25rem" }} aria-labelledby="visual-title">
      <div className="section-head">
        <h2 id="visual-title">{t("panelTitle")}</h2>
        {canCreate && <button type="button" className="btn small" onClick={create} disabled={pending || running || finishing || atCap}>{done || failed ? t("again") : t("create")}</button>}
      </div>
      {running && (
        <div role="status" aria-live="polite">
          <p>{job!.status === "queued" ? t("queued") : t("working")}{job!.percent != null ? ` ${job!.percent}%` : ""}</p>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job!.percent ?? 0} aria-label={t("working")}><span style={{ width: `${job!.percent ?? 8}%` }} /></div>
        </div>
      )}
      {finishing && <p role="status">{t("finishing")}</p>}
      {failed && <p className="error" role="alert">{err(job!.errorCode === "insufficient_credits" ? "insufficient_credits" : "failed")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {done && (
        <ul className="visual-grid">
          {job!.images.map((im) => (
            <li key={im.page} className="visual-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.url} alt={t("pageAlt", { n: im.page })} width={im.width ?? 1080} height={im.height ?? 1350} loading="lazy" />
              <a className="btn ghost small" href={im.url} download={`visual-${im.page}.png`}>{t("download")} · {t("page", { n: im.page })}</a>
            </li>
          ))}
        </ul>
      )}
      {!job && !error && <p className="stat-vs">{canCreate ? t("emptyStaff") : t("emptyClient")}</p>}
      {canCreate && <p className="stat-vs">{t("usage", { used, cap })}</p>}
    </section>
  );
}
