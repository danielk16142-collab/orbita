"use server";
import { z } from "zod";
import { allowedStatusChanges, cleanPost, formatKey, isTimeZone, parseContent, PostEdit, STATUSES, zonedToUtc, type Status } from "@orbita/content";
import { loadPost, postActor } from "@/lib/posts/access";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { removeMedia } from "@/lib/visuals/service";

export type PostResult = { ok: true; id?: string } | { ok: false; error: string };
const Uuid = z.string().uuid();
const fail = (error: string): PostResult => ({ ok: false, error });

async function gate() {
  const a = await postActor();
  if (!a.ok) return a;
  if (!(await limiter("post-action", 120, 10 * 60_000).hit(a.value.userId)).allowed) return { ok: false, error: "rate_limited" } as const;
  return a;
}

/** Add a post. Staff can add an idea or a draft for any client they can access; client users can only add ideas to their own client. */
export async function createPostAction(input: unknown): Promise<PostResult> {
  const p = z.object({
    clientId: Uuid.optional(), network: PostEdit.shape.network, language: PostEdit.shape.language, type: PostEdit.shape.type,
    idea: z.string().trim().min(1).max(2000), planned_date: PostEdit.shape.planned_date.optional(), status: z.enum(["idea", "draft"]).default("idea"),
    caption: z.string().trim().max(2200).optional(),
  }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const g = await gate(); if (!g.ok) return fail(g.error);
  const a = g.value;
  const clientId = a.isStaff ? p.data.clientId : a.profile.client_id;
  if (!clientId) return fail("bad_request");
  const status = a.isStaff ? p.data.status : "idea"; // the database enforces this too
  const { data, error } = await a.sb.from("posts").insert({
    client_id: clientId, network: p.data.network, language: p.data.language, type: p.data.type, idea: p.data.idea, status, source: "manual",
    ...(p.data.caption ? { caption: p.data.caption } : {}),
    planned_date: p.data.planned_date ?? null, created_by: a.userId,
  }).select("id").single();
  if (error || !data) return fail("forbidden");
  await audit({ agencyId: a.profile.agency_id, actor: a.userId, action: "post.created", entity: "post", entityId: data.id });
  return { ok: true, id: data.id };
}

/** Edit a post (staff). Structured content is validated against the post's format. Editing an approved post sends it back to draft (database rule). */
export async function updatePostAction(input: unknown): Promise<PostResult> {
  const p = z.object({ postId: Uuid, edit: PostEdit, content: z.unknown().optional() }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const g = await gate(); if (!g.ok) return fail(g.error);
  const a = g.value; if (!a.isStaff) return fail("forbidden");
  const post = await loadPost(a, p.data.postId); if (!post.ok) return fail(post.error);
  const content = p.data.content === undefined ? undefined : parseContent(p.data.edit.type, p.data.content);
  if (content && !content.ok) return fail("invalid_content");
  const { data, error } = await a.sb.from("posts").update({ ...p.data.edit, ...(content ? { content: content.value } : {}) }).eq("id", post.value.id).select("id");
  if (error || !data?.length) return fail("forbidden");
  await audit({ agencyId: a.profile.agency_id, actor: a.userId, action: "post.updated", entity: "post", entityId: post.value.id });
  return { ok: true };
}

/**
 * Change status. Allowed moves depend on the role (clients: approve a draft, or send an approved post back with a comment).
 * Scheduling needs a planned date; it records the exact publish instant using the CLIENT's timezone.
 */
export async function setStatusAction(input: unknown): Promise<PostResult> {
  const p = z.object({ postId: Uuid, status: z.enum(STATUSES), comment: z.string().trim().max(2000).optional() }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const g = await gate(); if (!g.ok) return fail(g.error);
  const a = g.value;
  const post = await loadPost(a, p.data.postId); if (!post.ok) return fail(post.error);
  const from = post.value.status as Status;
  if (!allowedStatusChanges(a.profile.role, from).includes(p.data.status)) return fail("not_allowed");
  if (a.profile.role === "client" && from === "approved" && !p.data.comment) return fail("comment_required"); // say what to change

  const patch: Record<string, unknown> = { status: p.data.status };
  if (p.data.status === "scheduled") {
    if (!post.value.planned_date) return fail("date_required");
    const { data: c } = await a.sb.from("clients").select("timezone").eq("id", post.value.client_id).maybeSingle();
    const tz = c?.timezone && isTimeZone(c.timezone) ? c.timezone : "UTC";
    patch.scheduled_at = zonedToUtc(post.value.planned_date, post.value.suggested_time || "09:00", tz).toISOString();
  } else if (from === "scheduled") patch.scheduled_at = null;

  if (p.data.comment) {
    const { error } = await a.sb.from("post_comments").insert({ post_id: post.value.id, client_id: post.value.client_id, body: p.data.comment });
    if (error) return fail("forbidden");
  }
  const { data, error } = await a.sb.from("posts").update(patch).eq("id", post.value.id).eq("status", from).select("id"); // only if nobody changed it meanwhile
  if (error || !data?.length) return fail("conflict");
  await audit({ agencyId: a.profile.agency_id, actor: a.userId, action: "post.status", entity: "post", entityId: post.value.id, meta: { from, to: p.data.status } });
  return { ok: true };
}

export async function addCommentAction(input: unknown): Promise<PostResult> {
  const p = z.object({ postId: Uuid, body: z.string().trim().min(1).max(2000) }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const g = await gate(); if (!g.ok) return fail(g.error);
  const post = await loadPost(g.value, p.data.postId); if (!post.ok) return fail(post.error);
  const { error } = await g.value.sb.from("post_comments").insert({ post_id: post.value.id, client_id: post.value.client_id, body: p.data.body }); // the database sets the author
  return error ? fail("forbidden") : { ok: true };
}

export async function deletePostAction(input: unknown): Promise<PostResult> {
  const p = z.object({ postId: Uuid }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const g = await gate(); if (!g.ok) return fail(g.error);
  if (!g.value.isStaff) return fail("forbidden");
  const post = await loadPost(g.value, p.data.postId); if (!post.ok) return fail(post.error);
  const { data } = await g.value.sb.from("posts").delete().eq("id", post.value.id).select("id");
  if (!data?.length) return fail("forbidden");
  await removeMedia(post.value.client_id, post.value.id).catch((e) => console.error("media cleanup failed:", e instanceof Error ? e.name : "unknown")); // stored images go with the post
  await audit({ agencyId: g.value.profile.agency_id, actor: g.value.userId, action: "post.deleted", entity: "post", entityId: post.value.id });
  return { ok: true };
}

export async function setClientTimezoneAction(input: unknown): Promise<PostResult> {
  const p = z.object({ clientId: Uuid, timezone: z.string().trim().max(64) }).safeParse(input);
  if (!p.success || !isTimeZone(p.data.timezone)) return fail("bad_request");
  const g = await gate(); if (!g.ok) return fail(g.error);
  if (!g.value.isStaff) return fail("forbidden");
  const { data } = await g.value.sb.from("clients").update({ timezone: p.data.timezone }).eq("id", p.data.clientId).select("id");
  if (!data?.length) return fail("forbidden");
  await audit({ agencyId: g.value.profile.agency_id, actor: g.value.userId, action: "client.timezone", entity: "client", entityId: p.data.clientId });
  return { ok: true };
}

/** Text formats (text post, article): the agent's reply becomes the caption of THIS planned post (staff; idea or draft only). */
export async function fillPostCaptionAction(input: unknown): Promise<PostResult> {
  const p = z.object({ postId: Uuid, caption: z.string().trim().min(1).max(2200) }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const g = await gate(); if (!g.ok) return fail(g.error);
  const a = g.value; if (!a.isStaff) return fail("forbidden");
  const post = await loadPost(a, p.data.postId); if (!post.ok) return fail(post.error);
  if (!["idea", "draft", "approved"].includes(post.value.status)) return fail("not_allowed");
  const { data, error } = await a.sb.from("posts").update({ caption: p.data.caption, type: formatKey(post.value.type), ...(post.value.status !== "draft" ? { status: "draft" } : {}) }).eq("id", post.value.id).eq("client_id", post.value.client_id).select("id");
  if (error || !data?.length) return fail("forbidden");
  await audit({ agencyId: a.profile.agency_id, actor: a.userId, action: "post.filled", entity: "post", entityId: post.value.id });
  return { ok: true };
}

/**
 * Clean the machine fingerprint (invisible characters, em dashes, curly quotes, stock words) out of a post's caption and content text (staff).
 * Hashtags are untouched. Like any edit, it sends an approved post back to draft (database rule).
 */
export async function cleanPostTextAction(input: unknown): Promise<PostResult & { removed?: number }> {
  const p = z.object({ postId: Uuid }).safeParse(input);
  if (!p.success) return fail("bad_request");
  const g = await gate(); if (!g.ok) return fail(g.error);
  const a = g.value; if (!a.isStaff) return fail("forbidden");
  const post = await loadPost(a, p.data.postId); if (!post.ok) return fail(post.error);
  const v = post.value;
  const r = cleanPost({ type: v.type, language: v.language, caption: v.caption, content: v.content });
  if (r.removed === 0) return { ok: true, removed: 0 };
  const parsed = parseContent(v.type, r.content);
  if (!parsed.ok) return fail("invalid_content");
  const { data, error } = await a.sb.from("posts").update({ caption: r.caption, ...(v.content != null ? { content: parsed.value } : {}) }).eq("id", v.id).select("id");
  if (error || !data?.length) return fail("forbidden");
  await audit({ agencyId: a.profile.agency_id, actor: a.userId, action: "post.cleaned", entity: "post", entityId: v.id, meta: { removed: r.removed } });
  return { ok: true, removed: r.removed };
}
