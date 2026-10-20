"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildVisualPrompt, clean, kindOfExt, MAX_MEDIA_PER_POST, MAX_UPLOAD_BYTES, MEDIA_TYPES, uploadPathPattern, VisualError } from "@orbita/visuals";
import { loadPost, postActor } from "@/lib/posts/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { BUCKET, removeObject, sniffStored, storedSize } from "@/lib/visuals/uploads";
import { DEFAULT_MONTHLY_CAP, describeVisualError, provider, providerConfigured, readModule, usedThisMonth } from "@/lib/visuals/service";

const Uuid = z.string().uuid();
export type VisualResult = { ok: true; jobId?: string } | { ok: false; error: string };
const fail = (error: string): VisualResult => ({ ok: false, error });
const BRAND_KIT = /^bk_[0-9A-Za-z_-]{4,60}$/;

/** Turn the visuals module on or off for a client, and set its monthly cap and optional Moda brand kit. Agency admins only. */
export async function setVisualsModuleAction(input: unknown): Promise<VisualResult> {
  const p = z.object({
    clientId: Uuid, enabled: z.boolean(), monthlyCap: z.number().int().min(0).max(1000).default(DEFAULT_MONTHLY_CAP),
    brandKitId: z.string().trim().max(80).optional().transform((v) => v || null),
  }).safeParse(input);
  if (!p.success || (p.data.brandKitId && !BRAND_KIT.test(p.data.brandKitId))) return fail("bad_request");
  const a = await postActor(); if (!a.ok) return fail(a.error);
  const v = a.value;
  if (v.profile.role !== "admin") return fail("forbidden");
  if (!(await limiter("module-set", 30, 10 * 60_000).hit(v.userId)).allowed) return fail("rate_limited");
  const { data: c } = await v.sb.from("clients").select("id").eq("id", p.data.clientId).maybeSingle(); // RLS: other agencies' clients are invisible
  if (!c) return fail("not_found");
  const config = { monthly_cap: p.data.monthlyCap, ...(p.data.brandKitId ? { brand_kit_id: p.data.brandKitId } : {}) };
  const { error } = await v.sb.from("client_modules").upsert({ client_id: p.data.clientId, module: "visuals", enabled: p.data.enabled, config }, { onConflict: "client_id,module" });
  if (error) return fail("forbidden");
  await audit({ agencyId: v.profile.agency_id, actor: v.userId, action: p.data.enabled ? "module.visuals.on" : "module.visuals.off", entity: "client", entityId: p.data.clientId, meta: { monthly_cap: p.data.monthlyCap } });
  return { ok: true };
}

/** Ask Moda to design the images for a carousel or static post. Staff only; the module must be on for the client. */
export async function createVisualAction(input: unknown): Promise<VisualResult> {
  const p = z.object({ postId: Uuid }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const a = await postActor(); if (!a.ok) return fail(a.error);
  const v = a.value;
  if (!v.isStaff) return fail("forbidden");
  if (!(await limiter("visual-start", 12, 10 * 60_000).hit(v.userId)).allowed) return fail("rate_limited");
  const post = await loadPost(v, p.data.postId); if (!post.ok) return fail(post.error);

  const mod = await readModule(v.sb, post.value.client_id);
  if (!mod.enabled) return fail("module_off");
  if (!providerConfigured()) return fail("not_configured");

  const { data: client } = await v.sb.from("clients").select("name, primary_color, accent_color, palette, font, body_font").eq("id", post.value.client_id).maybeSingle();
  if (!client) return fail("not_found");
  const built = buildVisualPrompt(
    { type: post.value.type, content: post.value.content },
    { name: client.name, language: (["en", "fr", "es"].includes(post.value.language) ? post.value.language : "en") as "en" | "fr" | "es", primary: client.primary_color, accent: client.accent_color, palette: Array.isArray(client.palette) ? client.palette : [], headingFont: client.font, bodyFont: client.body_font },
  );
  if (!built.ok) return fail(built.error === "unsupported" ? "unsupported" : "no_content");
  if ((await usedThisMonth(post.value.client_id)) >= mod.monthlyCap) return fail("cap_reached");

  // Record the job first (the unique "one active job per post" index also stops double clicks), then call Moda with the job's key.
  const admin = supabaseAdmin(); const key = `job:${randomUUID()}`;
  const { data: job, error: insErr } = await admin.from("visual_jobs").insert({ client_id: post.value.client_id, post_id: post.value.id, status: "queued", idempotency_key: key, pages: built.pages, requested_by: v.userId }).select("id").single();
  if (insErr || !job) return fail(insErr?.code === "23505" ? "busy" : "failed");
  try {
    const t = await provider().startTask({ prompt: built.prompt, format: built.format, pages: built.pages, brandKitId: mod.brandKitId, idempotencyKey: key });
    await admin.from("visual_jobs").update({ external_task_id: t.id, status: t.status === "running" ? "running" : "queued" }).eq("id", job.id);
  } catch (e) {
    console.error("visual start failed:", describeVisualError(e)); // provider details stay in the server log
    await admin.from("visual_jobs").update({ status: "failed", error_code: e instanceof VisualError ? e.code : "failed", completed_at: new Date().toISOString() }).eq("id", job.id);
    return fail(e instanceof VisualError && ["insufficient_credits", "rate_limited", "not_configured"].includes(e.code) ? e.code : "failed");
  }
  await audit({ agencyId: v.profile.agency_id, actor: v.userId, action: "visual.requested", entity: "post", entityId: post.value.id, meta: { pages: built.pages, job: job.id } });
  return { ok: true, jobId: job.id };
}

// ---- Files made outside Orbita, uploaded onto a post -------------------------------------------------------------------

export type UploadResult = { ok: true; path?: string; token?: string } | { ok: false; error: string };
const failU = (error: string): UploadResult => ({ ok: false, error });

/**
 * Step 1 of an upload: staff ask for permission to send one file to one post. The server checks who, which post, the declared
 * type and size, and how many files the post already has, then issues a one-time signed upload URL for a path it chose.
 */
export async function createUploadUrlAction(input: unknown): Promise<UploadResult> {
  const p = z.object({ postId: Uuid, name: z.string().trim().min(1).max(200), size: z.number().int().min(1), type: z.string().max(60) }).safeParse(input);
  if (!p.success) return failU("bad_request");
  const media = MEDIA_TYPES[p.data.type]; if (!media) return failU("bad_type");
  if (p.data.size > MAX_UPLOAD_BYTES) return failU("too_big");
  const a = await postActor(); if (!a.ok) return failU(a.error);
  if (!a.value.isStaff) return failU("forbidden");
  if (!(await limiter("media-upload", 40, 10 * 60_000).hit(a.value.userId)).allowed) return failU("rate_limited");
  const post = await loadPost(a.value, p.data.postId); if (!post.ok) return failU(post.error);
  const admin = supabaseAdmin();
  const { count } = await admin.from("post_media").select("id", { count: "exact", head: true }).eq("post_id", post.value.id);
  if ((count ?? 0) >= MAX_MEDIA_PER_POST) return failU("too_many");
  const path = `${post.value.client_id}/${post.value.id}/upload-${randomUUID()}.${media.ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) return failU("failed");
  return { ok: true, path, token: data.token };
}

/**
 * Step 2: the browser has sent the file. The server checks that the object exists, is not too big, and really is an
 * allowed image or video (by its first bytes, never by the name or declared type). Anything else is deleted. Then it records the file.
 */
export async function finalizeUploadAction(input: unknown): Promise<UploadResult> {
  const p = z.object({ postId: Uuid, path: z.string().max(300), name: z.string().trim().max(200).optional() }).safeParse(input);
  if (!p.success) return failU("bad_request");
  const a = await postActor(); if (!a.ok) return failU(a.error);
  if (!a.value.isStaff) return failU("forbidden");
  const post = await loadPost(a.value, p.data.postId); if (!post.ok) return failU(post.error);
  if (!uploadPathPattern(post.value.client_id, post.value.id).test(p.data.path)) return failU("bad_request"); // only paths this server issued for this post
  const size = await storedSize(p.data.path);
  if (size == null) return failU("failed");
  const ext = size <= MAX_UPLOAD_BYTES ? await sniffStored(p.data.path) : null;
  if (!ext) { await removeObject(p.data.path); return failU("invalid_file"); }
  const admin = supabaseAdmin();
  const { count } = await admin.from("post_media").select("id", { count: "exact", head: true }).eq("post_id", post.value.id);
  const page = Math.min(MAX_MEDIA_PER_POST, (count ?? 0) + 1);
  const name = clean(p.data.name ?? "", 120) || null;
  const { error } = await admin.from("post_media").insert({ post_id: post.value.id, client_id: post.value.client_id, path: p.data.path, page, kind: kindOfExt(ext), source: "uploaded", uploaded_by: a.value.userId, name });
  if (error && error.code !== "23505") { await removeObject(p.data.path); return failU("failed"); }
  await audit({ agencyId: a.value.profile.agency_id, actor: a.value.userId, action: "media.uploaded", entity: "post", entityId: post.value.id, meta: { kind: kindOfExt(ext), bytes: size } });
  return { ok: true };
}

/** Remove one uploaded or generated file from a post. Staff only; the file and its row go together. */
export async function deleteMediaAction(input: unknown): Promise<VisualResult> {
  const p = z.object({ mediaId: Uuid }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const a = await postActor(); if (!a.ok) return fail(a.error);
  if (!a.value.isStaff) return fail("forbidden");
  if (!(await limiter("media-delete", 60, 10 * 60_000).hit(a.value.userId)).allowed) return fail("rate_limited");
  const { data: row } = await a.value.sb.from("post_media").select("id, path, post_id, client_id").eq("id", p.data.mediaId).maybeSingle(); // RLS: only media this person can see
  if (!row) return fail("not_found");
  await removeObject(row.path);
  const { error } = await supabaseAdmin().from("post_media").delete().eq("id", row.id);
  if (error) return fail("failed");
  await audit({ agencyId: a.value.profile.agency_id, actor: a.value.userId, action: "media.deleted", entity: "post", entityId: row.post_id });
  return { ok: true };
}
