import { briefFromRow, focusFromRow } from "@orbita/agent";
import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** One client: details, brand brief, chosen topics and pillars, links, approved claims (proof items) and rules. */
export const GET = withApi<{ clientId: string }>(async (_req, ctx, { clientId }) => {
  const a = await apiActor(ctx, clientId);
  if (!a) return apiError("not_found", 404);
  const [{ data: client }, { data: brief }, { data: sources }, { data: proof }, { data: rules }] = await Promise.all([
    ctx.sb.from("clients").select("id, name, languages, markets, timezone, posting_goal").eq("id", clientId).maybeSingle(),
    ctx.sb.from("brand_briefs").select("*").eq("client_id", clientId).maybeSingle(),
    ctx.sb.from("client_sources").select("kind, url, handle").eq("client_id", clientId),
    ctx.sb.from("proof_items").select("id, claim, source, created_at").eq("client_id", clientId).limit(200),
    ctx.sb.from("client_rules").select("id, rule, created_at").eq("client_id", clientId).limit(200),
  ]);
  const row = brief as Record<string, unknown> | null;
  return apiJson({ client, brief: briefFromRow(row), focus: focusFromRow(row), sources: sources ?? [], proof_items: proof ?? [], rules: rules ?? [] });
});
