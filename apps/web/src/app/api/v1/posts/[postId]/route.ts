import { apiAudit, apiError, apiJson, body, withApi } from "@/lib/api/auth";
import { contentFor, POST_COLS, PostPatch, scheduledAt, statusProblem } from "@/lib/api/posts";

export const dynamic = "force-dynamic";
const MESSAGES: Record<string, string> = {
  post_locked: "This post is scheduled or published; this key cannot change it.",
  publish_not_allowed: "This key can only keep posts as ideas or drafts. Scheduling and publishing need the publish permission.",
};

export const GET = withApi<{ postId: string }>(async (_req, ctx, { postId }) => {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return apiError("not_found", 404);
  const { data } = await ctx.sb.from("posts").select(POST_COLS).eq("id", postId).maybeSingle();
  return data ? apiJson({ post: data }) : apiError("not_found", 404);
});

/** Edit a post. Drafts only unless the key may schedule or publish; editing an approved post sends it back to draft (database rule). */
export const PATCH = withApi<{ postId: string }>(async (req, ctx, { postId }) => {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return apiError("not_found", 404);
  const p = PostPatch.safeParse(await body(req));
  if (!p.success) return apiError("bad_request", 400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500));
  const { data: post } = await ctx.sb.from("posts").select("id, client_id, type, status, planned_date, suggested_time").eq("id", postId).maybeSingle();
  if (!post) return apiError("not_found", 404);
  const problem = statusProblem(ctx, post.status, p.data.status);
  if (problem) return apiError(problem, 403, MESSAGES[problem]);
  const c = contentFor(p.data.type ?? post.type, p.data.content);
  if (!c.ok) return apiError("invalid_content", 400, "content does not match the post type's structure.");
  const { content: _content, ...fields } = p.data;
  const patch: Record<string, unknown> = { ...fields, ...(c.value !== undefined ? { content: c.value } : {}) };
  if (p.data.status === "scheduled") {
    const { data: client } = await ctx.sb.from("clients").select("timezone").eq("id", post.client_id).maybeSingle();
    const at = scheduledAt(p.data.planned_date ?? post.planned_date, p.data.suggested_time ?? post.suggested_time, client?.timezone ?? null);
    if (!at) return apiError("bad_request", 400, "Scheduling needs a planned_date.");
    patch.scheduled_at = at;
  } else if (p.data.status && post.status === "scheduled") patch.scheduled_at = null;
  const { data, error } = await ctx.sb.from("posts").update(patch).eq("id", postId).select(POST_COLS).maybeSingle();
  if (error || !data) return apiError("forbidden", 403, "The post could not be updated.");
  await apiAudit(ctx, "api.post.updated", { entity: "post", entityId: postId, meta: { fields: Object.keys(patch), status: data.status } });
  return apiJson({ post: data });
});
