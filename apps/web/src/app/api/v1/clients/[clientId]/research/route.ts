import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** Saved research notes the agent reads when planning. */
export const GET = withApi<{ clientId: string }>(async (_req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const { data } = await ctx.sb.from("research_notes").select("id, kind, title, summary, sources, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(200);
  return apiJson({ research: data ?? [] });
});
