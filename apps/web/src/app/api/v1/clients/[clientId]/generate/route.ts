import { z } from "zod";
import { buildSystemPrompt, decideProposal, NETWORKS, postChatFocus, postChatTools, POST_DRAFT_TOOL, runAgent, wrapUntrusted, type IdeaFormat } from "@orbita/agent";
import { apiActor, apiAudit, apiError, apiJson, body, withApi } from "@/lib/api/auth";
import { loadClientContext, promptInput } from "@/lib/agent/context";
import { makePorts } from "@/lib/agent/ports";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { supabaseProposalRepo } from "@/lib/agent/repo";
import { describeModelError } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { POST_COLS } from "@/lib/api/posts";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const FORMATS = Object.keys(POST_DRAFT_TOOL) as [IdeaFormat, ...IdeaFormat[]];
const Body = z.object({
  format: z.enum(FORMATS), network: z.enum(NETWORKS), idea: z.string().trim().min(3).max(1000),
  language: z.enum(["en", "fr", "es"]).optional(), planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  save_as_draft: z.boolean().default(true),
}).strict();

/**
 * Have Orbita's own agent write a reel script, carousel, static post or story for a client, with the client's brand,
 * strategy, topics, rules and results. The result is a suggestion ("Ready for review" in the app); with save_as_draft
 * (the default) it is accepted at once as a DRAFT post on the calendar. Never approved, scheduled or published.
 */
export const POST = withApi<{ clientId: string }>(async (req, ctx, { clientId }) => {
  const actor = await apiActor(ctx, clientId);
  if (!actor) return apiError("not_found", 404);
  const p = Body.safeParse(await body(req));
  if (!p.success) return apiError("bad_request", 400, p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500));
  const ai = await resolveModelAccess(actor);
  if (!ai) return apiError("not_configured", 503, "The agent is not configured.");
  if (!(await limiter(`api-generate:${ctx.key.id}`, 30, 60 * 60_000).hit(ctx.key.id)).allowed) return apiError("rate_limited", 429, "30 generations per hour.");
  if (await overDailyCap(actor)) return apiError("daily_cap", 429, "Today's agent limit is reached.");

  const language = p.data.language ?? actor.client.languages[0] ?? "en";
  const ctxData = await loadClientContext(actor.sb, actor.clientId);
  const input = promptInput(actor, ctxData, language);
  const started = new Date().toISOString();
  const proposals: string[] = [];
  try {
    const result = await runAgent({
      client: ai.client, model: ai.chatModel, maxSteps: 6,
      system: buildSystemPrompt(input) + postChatFocus({ format: p.data.format, networks: [p.data.network], idea: p.data.idea }),
      messages: [{ role: "user", content: `Write this ${p.data.format} for ${p.data.network} in ${language}, ready to review. Use the drafting tool once.\n${wrapUntrusted("the request from the team's assistant", p.data.idea, 1200)}` }],
      ports: makePorts(actor, { conversationId: null, weekStart: input.weekStart, userTexts: [p.data.idea] }), toolNames: postChatTools(p.data.format),
      onEvent: (e) => { if (e.type === "proposal" && e.target === "post") proposals.push(e.id); },
    });
    await recordUsage(actor, result.usage.input + result.usage.output);
    if (!proposals.length) return apiError("no_result", 502, "The agent did not produce a draft. Try a more specific idea.");
  } catch (e) {
    console.error("api generate failed:", describeModelError(e));
    return apiError("model_error", 502);
  }

  const proposalId = proposals[0];
  await apiAudit(ctx, "api.content.generated", { entity: "proposal", entityId: proposalId, meta: { format: p.data.format, network: p.data.network } });
  if (!p.data.save_as_draft) {
    const { data: proposal } = await actor.sb.from("proposals").select("id, target, payload, reason, status").eq("id", proposalId).maybeSingle();
    return apiJson({ proposal, post: null }, 201);
  }
  const r = await decideProposal(supabaseProposalRepo(actor), { proposalId, decision: "accept" });
  if (!r.ok) return apiError("save_failed", 502, "The draft was written but could not be saved; it is waiting in Ready for review.");
  let { data: post } = await actor.sb.from("posts").select(POST_COLS).eq("client_id", clientId).gte("created_at", started).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (post && p.data.planned_date) post = (await actor.sb.from("posts").update({ planned_date: p.data.planned_date }).eq("id", post.id).select(POST_COLS).maybeSingle()).data ?? post;
  await apiAudit(ctx, "api.post.created", { entity: "post", entityId: post?.id, meta: { from: "generate", proposalId } });
  return apiJson({ proposal_id: proposalId, post }, 201);
});
