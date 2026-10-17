import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** What the agent has learned about the brand (active memories: preferences, things to avoid, rules, facts). */
export const GET = withApi<{ clientId: string }>(async (_req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const { data } = await ctx.sb.from("brand_memories").select("id, kind, content, weight, source, created_at").eq("client_id", clientId).eq("status", "active").order("created_at", { ascending: false }).limit(300);
  return apiJson({ memories: data ?? [] });
});
