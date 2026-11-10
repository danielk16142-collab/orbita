import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";
import { strategyLanguage } from "@/lib/languages";

export const dynamic = "force-dynamic";

/**
 * The active content strategy (objectives, pillars, series, cadence, topics, links), or null. Each language has its own:
 * ?language=en|fr|es picks one (default: the client's first language); `strategies` lists every active one.
 */
export const GET = withApi<{ clientId: string }>(async (req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const [{ data: rows }, { data: client }] = await Promise.all([
    ctx.sb.from("strategies").select("id, title, period, content, created_at, language").eq("client_id", clientId).eq("active", true).limit(3),
    ctx.sb.from("clients").select("languages").eq("id", clientId).maybeSingle(),
  ]);
  const language = strategyLanguage(new URL(req.url).searchParams.get("language"), client?.languages as string[] | undefined);
  return apiJson({ language, strategy: (rows ?? []).find((r) => r.language === language) ?? null, strategies: rows ?? [] });
});
