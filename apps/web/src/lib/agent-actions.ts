"use server";
import { z } from "zod";
import { decideProposal, runTool, SOURCE_KINDS } from "@orbita/agent";
import { resolveAgentActor, type AgentActor } from "@/lib/agent/access";
import { makePorts } from "@/lib/agent/ports";
import { supabaseProposalRepo } from "@/lib/agent/repo";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export type ActionResult = { ok: true; outcome?: string } | { ok: false; error: string };

const Uuid = z.string().uuid();
const Base = { clientId: Uuid.optional() };

/** Common gate for every agent action: signed in, MFA/terms cleared, a client the caller may access, rate limited. */
type Gate = { actor: AgentActor; error?: undefined } | { actor?: undefined; error: string };
async function gate(clientId: string | undefined): Promise<Gate> {
  const a = await resolveAgentActor(clientId);
  if (!a.ok) return { error: a.status === 401 ? "unauthorized" : a.status === 403 ? "forbidden" : "not_found" };
  if (!(await limiter("agent-action", 60, 10 * 60_000).hit(a.actor.userId)).allowed) return { error: "rate_limited" };
  return { actor: a.actor };
}

const Decide = z.object({
  ...Base, proposalId: Uuid, decision: z.enum(["accept", "reject"]), comment: z.string().max(1000).optional(),
  edited: z.unknown().optional().refine((v) => v === undefined || JSON.stringify(v).length <= 30_000, "too large"),
});

/** Accept (optionally with edits) or reject a suggestion from the agent. */
export async function decideProposalAction(input: unknown): Promise<ActionResult> {
  const p = Decide.safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if (!g.actor) return { ok: false, error: g.error };
  const r = await decideProposal(supabaseProposalRepo(g.actor), { proposalId: p.data.proposalId, decision: p.data.decision, edited: p.data.edited, comment: p.data.comment });
  if (!r.ok) return { ok: false, error: r.error };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: `agent.proposal_${r.outcome}`, entity: "proposal", entityId: p.data.proposalId });
  return { ok: true, outcome: r.outcome };
}

export async function archiveMemoryAction(input: unknown): Promise<ActionResult> {
  const p = z.object({ ...Base, id: Uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if (!g.actor) return { ok: false, error: g.error };
  const { data } = await g.actor.sb.from("brand_memories").update({ status: "archived" }).eq("id", p.data.id).eq("client_id", g.actor.clientId).select("id");
  if (!data?.length) return { ok: false, error: "not_found" };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "agent.memory_archived", entity: "memory", entityId: p.data.id });
  return { ok: true };
}

export async function addSourceAction(input: unknown): Promise<ActionResult> {
  const p = z.object({ ...Base, kind: z.enum(SOURCE_KINDS), url: z.string().max(500).default(""), handle: z.string().max(120).default("") }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if (!g.actor) return { ok: false, error: g.error };
  // Same validation as the agent's own add_source tool (SSRF checks for websites, domain checks for social links).
  const r = await runTool("add_source", { kind: p.data.kind, url: p.data.url, handle: p.data.handle }, makePorts(g.actor, { conversationId: null, weekStart: "" }), { proposals: 0, fetches: 0, pages: [] });
  if (r.isError) return { ok: false, error: "invalid" };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "agent.source_added", entity: "client", entityId: g.actor.clientId, meta: { kind: p.data.kind } });
  return { ok: true };
}

export async function removeSourceAction(input: unknown): Promise<ActionResult> {
  const p = z.object({ ...Base, id: Uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if (!g.actor) return { ok: false, error: g.error };
  const { data } = await g.actor.sb.from("client_sources").delete().eq("id", p.data.id).eq("client_id", g.actor.clientId).select("id");
  if (!data?.length) return { ok: false, error: "not_found" };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "agent.source_removed", entity: "client", entityId: g.actor.clientId });
  return { ok: true };
}
