import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** Competitors with their latest analysis. */
export const GET = withApi<{ clientId: string }>(async (_req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const [{ data: comps }, { data: analyses }] = await Promise.all([
    ctx.sb.from("competitors").select("id, name, website, url, links, notes, last_researched_at").eq("client_id", clientId).order("created_at"),
    ctx.sb.from("competitor_analyses").select("competitor_id, analysis, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(200),
  ]);
  const latest = new Map<string, { analysis: unknown; created_at: string }>();
  for (const a of analyses ?? []) if (!latest.has(a.competitor_id)) latest.set(a.competitor_id, { analysis: a.analysis, created_at: a.created_at });
  return apiJson({ competitors: (comps ?? []).map((c) => ({ ...c, latest_analysis: latest.get(c.id) ?? null })) });
});
