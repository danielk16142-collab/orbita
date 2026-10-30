import { z } from "zod";
import { formatKey } from "@orbita/content";
import { resolveAgentActor } from "@/lib/agent/access";
import { json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), format: z.string().max(20), networks: z.array(z.string().max(20)).max(5).default([]) });
type Content = { topics?: string[]; series?: { name: string; subject: string; networks?: string[]; formats?: string[] }[]; pillars?: { name: string; angle: string; share_percent: number }[] };

/**
 * Ideas straight from the active strategy, with no model call: posts already planned that still need writing, the recurring series
 * that fit the chosen format and networks, and the topic bank. The model-made ideas stay in their own section on the page.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  if (!(await limiter("strategy-ideas", 60, 10 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  const format = formatKey(body.data.format);

  const [{ data: strategy }, { data: planned }] = await Promise.all([
    actor.sb.from("strategies").select("title, content").eq("client_id", actor.clientId).eq("active", true).maybeSingle(),
    actor.sb.from("posts").select("id, type, network, idea, planned_date, status").eq("client_id", actor.clientId).in("status", ["idea", "draft"]).not("idea", "is", null).order("planned_date", { ascending: true, nullsFirst: false }).limit(60),
  ]);
  const c = (strategy?.content ?? {}) as Content;
  const nets = body.data.networks;
  const series = (c.series ?? []).filter((s) => (!s.formats?.length || s.formats.some((f) => formatKey(f) === format)) && (!nets.length || !s.networks?.length || s.networks.some((n) => nets.includes(n)))).slice(0, 6);
  const plannedMatches = (planned ?? []).filter((p) => formatKey(p.type) === format && (!nets.length || nets.includes(p.network))).slice(0, 8)
    .map((p) => ({ id: p.id, idea: String(p.idea).slice(0, 220), network: p.network, date: p.planned_date, status: p.status }));
  return json({ hasStrategy: !!strategy, title: strategy?.title ?? null, planned: plannedMatches, series: series.map((s) => ({ name: s.name, subject: s.subject })), topics: (c.topics ?? []).slice(0, 12) });
}
