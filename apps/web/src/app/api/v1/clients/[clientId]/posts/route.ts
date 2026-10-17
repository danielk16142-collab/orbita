import { z } from "zod";
import { apiActor, apiAudit, apiError, apiJson, body, withApi } from "@/lib/api/auth";
import { contentFor, POST_COLS, PostCreate } from "@/lib/api/posts";

export const dynamic = "force-dynamic";

const Query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["idea", "draft", "approved", "scheduled", "publishing", "published", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** The client's posts on the calendar, by planned date. */
export const GET = withApi<{ clientId: string }>(async (req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return apiError("bad_request", 400, "from/to are YYYY-MM-DD, limit is 1 to 200.");
  let query = ctx.sb.from("posts").select(POST_COLS).eq("client_id", clientId);
  if (q.data.from) query = query.gte("planned_date", q.data.from);
  if (q.data.to) query = query.lte("planned_date", q.data.to);
  if (q.data.status) query = query.eq("status", q.data.status);
  const { data } = await query.order("planned_date", { ascending: true, nullsFirst: false }).limit(q.data.limit);
  return apiJson({ posts: data ?? [] });
});

/** Create a post as an idea or a draft (never approved, scheduled or published). */
export const POST = withApi<{ clientId: string }>(async (req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const p = PostCreate.safeParse(await body(req));
  if (!p.success) return apiError("bad_request", 400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500));
  const c = contentFor(p.data.type, p.data.content);
  if (!c.ok) return apiError("invalid_content", 400, "content does not match the post type's structure.");
  const { content: _content, ...fields } = p.data;
  const { data, error } = await ctx.sb.from("posts").insert({
    client_id: clientId, ...fields, ...(c.value !== undefined ? { content: c.value } : {}), source: "agent", created_by: ctx.key.agentUserId,
  }).select(POST_COLS).single();
  if (error || !data) return apiError("forbidden", 403, "The post could not be created.");
  await apiAudit(ctx, "api.post.created", { entity: "post", entityId: data.id, meta: { status: data.status } });
  return apiJson({ post: data }, 201);
});
