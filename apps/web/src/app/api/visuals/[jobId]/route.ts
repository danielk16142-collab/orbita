import { z } from "zod";
import { getSession, sessionProblem } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { limiter } from "@/lib/rate-limit";
import { json } from "@/lib/agent/http";
import { describeVisualError, provider, storeExport } from "@/lib/visuals/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TERMINAL = ["succeeded", "failed", "canceled"];

/**
 * Status of one generation. Anyone who can see the post (row-level security) can read it; only staff move it forward:
 * a staff poll asks Moda, and when the task has finished it stores the images once (the job is claimed first, so two
 * polls never store twice). No worker is needed: the page polls while it is open.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  if (!z.string().uuid().safeParse(jobId).success) return json({ error: "bad_request" }, 400);
  const s = await getSession();
  if (!s) return json({ error: "unauthorized" }, 401);
  if (await sessionProblem(s)) return json({ error: "forbidden" }, 403);
  if (!(await limiter("visual-poll", 90, 60_000).hit(s.user.id)).allowed) return json({ error: "rate_limited" }, 429);

  const cols = "id, client_id, post_id, status, error_code, pages, external_task_id, credits, created_at";
  let { data: job } = await s.sb.from("visual_jobs").select(cols).eq("id", jobId).maybeSingle();
  if (!job) return json({ error: "not_found" }, 404);
  const staff = s.profile.role !== "client";

  let percent: number | null = null;
  if (staff && !TERMINAL.includes(job.status) && job.external_task_id) {
    const admin = supabaseAdmin();
    try {
      const t = await provider().getTask(job.external_task_id);
      percent = t.percent;
      if (t.status === "succeeded" && t.exportUrl) {
        // claim: only the request that flips the status stores the images
        const { data: won } = await admin.from("visual_jobs").update({ status: "succeeded", credits: t.credits, completed_at: new Date().toISOString() }).eq("id", job.id).in("status", ["queued", "running"]).select("id").maybeSingle();
        if (won) {
          try { await storeExport(job, t.exportUrl, t.exportFormat); }
          catch (e) { console.error("visual store failed:", describeVisualError(e)); await admin.from("visual_jobs").update({ status: "failed", error_code: "store_failed" }).eq("id", job.id); }
        }
      } else if (["failed", "canceled", "expired"].includes(t.status)) {
        await admin.from("visual_jobs").update({ status: "failed", error_code: t.errorCode ?? "failed", credits: t.credits, completed_at: new Date().toISOString() }).eq("id", job.id).in("status", ["queued", "running"]);
      } else if (t.status === "running" && job.status === "queued") {
        await admin.from("visual_jobs").update({ status: "running" }).eq("id", job.id).eq("status", "queued");
      }
    } catch (e) {
      console.error("visual poll failed:", describeVisualError(e)); // transient: the client simply polls again
    }
    job = (await s.sb.from("visual_jobs").select(cols).eq("id", jobId).maybeSingle()).data ?? job;
  }

  const { data: media } = await s.sb.from("post_media").select("path, page, width, height").eq("job_id", job.id).order("page");
  const images = await Promise.all((media ?? []).map(async (m) => ({ page: m.page, width: m.width, height: m.height, url: (await s.sb.storage.from("post-media").createSignedUrl(m.path, 3600)).data?.signedUrl ?? null })));
  return json({ id: job.id, status: job.status, errorCode: job.error_code, pages: job.pages, percent, images: images.filter((i) => i.url) }, 200);
}
