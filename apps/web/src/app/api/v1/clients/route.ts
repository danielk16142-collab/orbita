import { apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** Every client of the agency (row-level security as the key's team member). */
export const GET = withApi(async (_req, ctx) => {
  const { data } = await ctx.sb.from("clients").select("id, name, languages, markets, timezone, posting_goal").order("name");
  return apiJson({ clients: data ?? [] });
});
