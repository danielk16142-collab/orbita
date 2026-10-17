import { z } from "zod";
import { isTimeZone } from "@orbita/content";
import { apiAudit, apiError, apiJson, body, withApi } from "@/lib/api/auth";
import { limiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Every client of the agency (row-level security as the key's team member). */
export const GET = withApi(async (_req, ctx) => {
  const { data } = await ctx.sb.from("clients").select("id, name, languages, markets, timezone, posting_goal").order("name");
  return apiJson({ clients: data ?? [] });
});

const ClientCreate = z.object({
  name: z.string().trim().min(1).max(120),
  languages: z.array(z.enum(["en", "fr", "es"])).min(1).max(3).default(["en"]),
  markets: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  timezone: z.string().max(64).refine(isTimeZone, "an IANA timezone such as America/Toronto").optional(),
}).strict();

/**
 * Create a client account for the agency, with an empty brand profile (like "New client" in the app).
 * Refuses a name the agency already uses, so an agent cannot create the same client twice. 10 per day per key.
 */
export const POST = withApi(async (req, ctx) => {
  const p = ClientCreate.safeParse(await body(req));
  if (!p.success) return apiError("bad_request", 400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500));
  if (!(await limiter(`api-clients:${ctx.key.id}`, 10, 24 * 60 * 60_000).hit(ctx.key.id)).allowed) return apiError("rate_limited", 429, "10 new clients per day per key.");
  const { data: same } = await ctx.sb.from("clients").select("id, name").ilike("name", p.data.name.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1);
  if (same?.length) return apiError("already_exists", 409, `A client named "${same[0].name}" already exists (id ${same[0].id}).`);
  const { data, error } = await ctx.sb.from("clients").insert({
    agency_id: ctx.key.agencyId, name: p.data.name, languages: p.data.languages, markets: [...new Set(p.data.markets)],
    ...(p.data.timezone ? { timezone: p.data.timezone } : {}),
  }).select("id, name, languages, markets, timezone, posting_goal").single();
  if (error || !data) return apiError("forbidden", 403, "The client could not be created.");
  await ctx.sb.from("brand_briefs").insert({ client_id: data.id });
  await apiAudit(ctx, "api.client.created", { entity: "client", entityId: data.id, meta: { name: data.name } });
  return apiJson({ client: data }, 201);
});
