import "server-only";
import type { ApiCtx } from "./auth";
import { archiveMemoryAction, addSourceAction, decideProposalAction, deleteResearchAction, getProposalAction, removeSourceAction } from "@/lib/agent-actions";
import { addCommentAction, createPostAction, deletePostAction, setClientTimezoneAction, setStatusAction, updatePostAction } from "@/lib/posts-actions";
import { addWeekPostsAction, movePostAction, setPostingGoalAction } from "@/lib/cadence-actions";
import { archiveStrategyAction, saveFocusAction } from "@/lib/focus-actions";
import { acceptKickstartAction, dismissKickstartAction } from "@/lib/kickstart-actions";
import { analysisToResearchAction, rememberFindingAction, removeCompetitorAction, saveCompetitorAction, saveFindingAction } from "@/lib/research-actions";
import { refreshAccountAction } from "@/lib/connections-actions";
import { deleteReferenceAction, saveColorsAction, savePaletteAction, uploadLogoAction, uploadReferenceAction } from "@/lib/branding-actions";
import { updateClientAction } from "@/app/[locale]/(agency)/clients/actions";
import * as agentChat from "@/app/api/agent/chat/route";
import * as agentLearn from "@/app/api/agent/learn/route";
import * as agentClose from "@/app/api/agent/close/route";
import * as postChat from "@/app/api/posts/chat/route";
import * as postIdeas from "@/app/api/posts/ideas/route";
import * as fillWeek from "@/app/api/posts/fill-week/route";
import * as researchRun from "@/app/api/research/run/route";
import * as competitorAnalyze from "@/app/api/competitors/analyze/route";
import * as kickstartRun from "@/app/api/kickstart/run/route";
import * as strategyConnect from "@/app/api/strategy/connect/route";
import * as strategyTag from "@/app/api/strategy/tag/route";
import * as brandSuggest from "@/app/api/brand/suggest/route";

/**
 * Everything a team member can do in the app, callable by the API as POST /api/v1/actions/{name}. Each entry runs the
 * very same server action or route the app uses, under the key's team identity (row-level security decides what it
 * sees). Not here on purpose, because they stay with a person: API keys, deleting clients, invitations, account
 * deletion and privacy requests, MFA, terms, connecting or disconnecting social accounts, and locking a client's branding.
 */
type Input = Record<string, unknown>;
type Base = { summary: string; input: string; group: string };
export type ApiAction = Base & (
  | { kind: "fn"; run: (input: Input) => Promise<unknown>; needsPublish?: (input: Input) => boolean }
  | { kind: "form"; run: (form: FormData) => Promise<unknown>; form: (input: Input, ctx: ApiCtx) => Promise<FormData> }
  | { kind: "route"; run: (req: Request) => Promise<Response>; stream?: boolean }
);

const C = "clientId (uuid)";
const L = "locale (en|fr|es, default: the key's language)";

function formOf(fields: Record<string, unknown>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => f.append(k, String(x)));
    else if (v instanceof File) f.append(k, v);
    else f.append(k, String(v));
  }
  return f;
}

/** A file sent as base64 (optionally a data: URL). The action itself checks the real type and size. */
function fileOf(input: Input): File | null {
  const raw = typeof input.file_base64 === "string" ? input.file_base64.replace(/^data:[^,]*,/, "") : "";
  if (!raw || raw.length > 14_000_000) return null;
  return new File([Buffer.from(raw, "base64")], typeof input.filename === "string" ? input.filename.slice(0, 100) : "upload", { type: "application/octet-stream" });
}

const branding = (extra: (input: Input) => Record<string, unknown>) => async (input: Input) =>
  formOf({ clientId: input.clientId, locale: input.locale, ...extra(input) });

export const API_ACTIONS: Record<string, ApiAction> = {
  // The agent: chat, threads, suggestions
  agent_chat: { group: "agent", kind: "route", run: agentChat.POST, stream: true, summary: "Talk to the client's agent, exactly like the chat in the app (briefing the brand, asking for ideas, plans, research). Suggestions it makes land in Ready for review: decide them with decide_proposal. Keep conversationId to continue the same thread.", input: `${C}, message (string), conversationId (uuid, optional), ${L}` },
  agent_learn: { group: "agent", kind: "route", run: agentLearn.POST, summary: "Have the agent turn a conversation into brand memories (runs automatically every 8 messages of agent_chat).", input: `${C}, conversationId, ${L}` },
  agent_close: { group: "agent", kind: "route", run: agentClose.POST, summary: "Close a conversation thread (\"New conversation\"): the agent writes a handover so the next thread keeps the context.", input: `${C}, conversationId, ${L}` },
  get_proposal: { group: "agent", kind: "fn", run: getProposalAction, summary: "One suggestion from the agent, with its full payload.", input: `${C}, id (proposal uuid)` },
  decide_proposal: { group: "agent", kind: "fn", run: decideProposalAction, summary: "Accept (optionally with your edits) or reject a suggestion in Ready for review: brief changes, strategy, plans, posts.", input: `${C}, proposalId, decision (accept|reject), comment (optional), edited (optional: the payload with your changes)` },
  archive_memory: { group: "agent", kind: "fn", run: archiveMemoryAction, summary: "Make the agent forget one learned memory.", input: `${C}, id (memory uuid)` },
  add_source: { group: "agent", kind: "fn", run: addSourceAction, summary: "Add a link the agent can read (website or social handle).", input: `${C}, kind (website|instagram|tiktok|linkedin|youtube|facebook|...), url, handle` },
  remove_source: { group: "agent", kind: "fn", run: removeSourceAction, summary: "Remove a link.", input: `${C}, id` },

  // Research and competitors
  run_research: { group: "research", kind: "route", run: researchRun.POST, summary: "Ask the agent a research question (web search). Returns findings to save.", input: `${C}, question (3-500 chars), ${L}` },
  save_finding: { group: "research", kind: "fn", run: saveFindingAction, summary: "Save a research finding as a note the agent reads when planning.", input: `${C}, note {kind: trend|competitor|audience|idea, title, summary, sources: [{title, url https}]}` },
  remember_finding: { group: "research", kind: "fn", run: rememberFindingAction, summary: "Save a finding as a brand memory.", input: `${C}, content (max 1000)` },
  delete_research: { group: "research", kind: "fn", run: deleteResearchAction, summary: "Delete a research note.", input: `${C}, id` },
  save_competitor: { group: "research", kind: "fn", run: saveCompetitorAction, summary: "Add or edit a competitor (pass id to edit).", input: `${C}, id (optional), name, website (https), notes, links {instagram|tiktok|...: url or @handle}` },
  remove_competitor: { group: "research", kind: "fn", run: removeCompetitorAction, summary: "Remove a competitor.", input: `${C}, id` },
  analyze_competitor: { group: "research", kind: "route", run: competitorAnalyze.POST, summary: "Have the agent analyze one competitor.", input: `${C}, competitorId, ${L}` },
  analysis_to_research: { group: "research", kind: "fn", run: analysisToResearchAction, summary: "Save a competitor analysis as research notes.", input: `${C}, analysisId` },

  // Posts and calendar
  post_ideas: { group: "posts", kind: "route", run: postIdeas.POST, summary: "Post ideas from the strategy, research and results (the Create post page).", input: `${C}, format (reel|carousel|static|story|video|...), networks [instagram|tiktok|linkedin|youtube|facebook], ${L}` },
  post_chat: { group: "posts", kind: "route", run: postChat.POST, stream: true, summary: "The post chat on the Create post page: work one post with the agent; its drafts arrive as suggestions (decide_proposal).", input: `${C}, message, conversationId (optional), format, networks [..], idea (optional), ${L}` },
  fill_week: { group: "posts", kind: "route", run: fillWeek.POST, summary: "Fill the week: the agent proposes posts for the open days of this week (add them with add_week_posts).", input: `${C}, network, ${L}` },
  add_week_posts: { group: "posts", kind: "fn", run: addWeekPostsAction, summary: "Add proposed week posts to the calendar as ideas.", input: `${C}, network, language, posts [{date YYYY-MM-DD, format, title, hook, why}] (1-7)` },
  create_post: { group: "posts", kind: "fn", run: createPostAction, summary: "Add a post as an idea or draft.", input: `${C}, network, language, type, idea, planned_date (optional), status (idea|draft), caption (optional)` },
  update_post: { group: "posts", kind: "fn", run: updatePostAction, summary: "Edit a post (caption, hashtags, date, pillar, content...).", input: "postId, edit {network, language, type, idea, caption, hashtags, pillar, persona, funnel_stage, planned_date, suggested_time}, content (optional)" },
  set_post_status: { group: "posts", kind: "fn", run: setStatusAction, needsPublish: (i) => i.status === "scheduled" || i.status === "published" || i.status === "publishing", summary: "Move a post along: idea, draft, approved... scheduled and published need a key with the publish permission.", input: "postId, status, comment (optional)" },
  move_post: { group: "posts", kind: "fn", run: movePostAction, summary: "Move a post to another day.", input: `${C}, postId, date (YYYY-MM-DD)` },
  comment_post: { group: "posts", kind: "fn", run: addCommentAction, summary: "Comment on a post.", input: "postId, body" },
  delete_post: { group: "posts", kind: "fn", run: deletePostAction, summary: "Delete a post (not once scheduled or published).", input: "postId" },
  set_posting_goal: { group: "posts", kind: "fn", run: setPostingGoalAction, summary: "Set the weekly posting goal.", input: `${C}, goal (1-21)` },

  // Strategy and focus
  save_focus: { group: "strategy", kind: "fn", run: saveFocusAction, summary: "Save what the brand talks about: topics and pillars.", input: `${C}, focus {topics: [..], pillars: [..]} (see GET /clients/{id} → focus for the shape)` },
  suggest_focus: { group: "strategy", kind: "route", run: brandSuggest.POST, summary: "Have the agent suggest topics or pillars.", input: `${C}, kind (topics|pillars), topics [..] (for pillars), ${L}` },
  archive_strategy: { group: "strategy", kind: "fn", run: archiveStrategyAction, summary: "Archive the current strategy to start a new one with the agent.", input: C },
  strategy_connect: { group: "strategy", kind: "route", run: strategyConnect.POST, summary: "Have the agent connect pillars to goals and audiences (the mind map).", input: `${C}, ${L}` },
  strategy_tag: { group: "strategy", kind: "route", run: strategyTag.POST, summary: "Have the agent tag untagged posts with a pillar.", input: C },

  // Kickstart and accounts
  kickstart_run: { group: "kickstart", kind: "route", run: kickstartRun.POST, summary: "Build the first two weeks plan for a connected account.", input: `${C}, accountId, ${L}` },
  kickstart_accept: { group: "kickstart", kind: "fn", run: acceptKickstartAction, summary: "Add chosen kickstart items to the calendar.", input: `${C}, id (kickstart uuid), items [index..], language, setGoal (boolean)` },
  kickstart_dismiss: { group: "kickstart", kind: "fn", run: dismissKickstartAction, summary: "Dismiss a kickstart plan.", input: `${C}, id` },
  refresh_account: { group: "kickstart", kind: "fn", run: refreshAccountAction, summary: "Sync a connected social account now.", input: `${C}, accountId` },

  // Client profile and branding
  update_client: { group: "profile", kind: "form", run: updateClientAction, summary: "Edit the client's name, languages and markets (fields you leave out keep their value).",
    input: `${C}, name, languages [en|fr|es], markets [..]`,
    form: async (i, ctx) => {
      const { data: c } = await ctx.sb.from("clients").select("name, languages, markets").eq("id", String(i.clientId ?? "")).maybeSingle();
      const markets = Array.isArray(i.markets) ? i.markets.join(", ") : typeof i.markets === "string" ? i.markets : (c?.markets ?? []).join(", ");
      return formOf({ clientId: i.clientId, locale: i.locale, name: i.name ?? c?.name, languages: i.languages ?? c?.languages, markets });
    } },
  set_timezone: { group: "profile", kind: "fn", run: setClientTimezoneAction, summary: "Set the client's timezone (IANA, e.g. America/Toronto).", input: `${C}, timezone` },
  save_colors: { group: "profile", kind: "form", run: saveColorsAction, form: branding((i) => ({ primary: i.primary, accent: i.accent, reset: i.reset ? "1" : undefined })), summary: "Brand colors (checked for contrast).", input: `${C}, primary (#hex), accent (#hex), reset (boolean)` },
  save_palette: { group: "profile", kind: "form", run: savePaletteAction, form: branding((i) => ({ palette: JSON.stringify(i.palette ?? []), font: i.font, body_font: i.body_font })), summary: "Brand palette and fonts.", input: `${C}, palette [{role, hex}], font, body_font` },
  upload_logo: { group: "profile", kind: "form", run: uploadLogoAction, form: branding((i) => ({ variant: i.variant, file: fileOf(i) })), summary: "Upload a logo (PNG, JPEG or WebP, re-encoded).", input: `${C}, variant (light|dark), file_base64, filename` },
  upload_reference: { group: "profile", kind: "form", run: uploadReferenceAction, form: branding((i) => ({ kind: i.kind, caption: i.caption, file: fileOf(i) })), summary: "Upload a reference visual.", input: `${C}, kind, caption, file_base64, filename` },
  delete_reference: { group: "profile", kind: "form", run: deleteReferenceAction, form: branding((i) => ({ id: i.id })), summary: "Delete a reference visual.", input: `${C}, id` },
};

/** The catalog served at GET /api/v1/actions. */
export const actionCatalog = () => Object.entries(API_ACTIONS).map(([name, a]) => ({ name, group: a.group, summary: a.summary, input: a.input, ...(a.kind === "fn" && a.needsPublish ? { publish_gated: true } : {}) }));

/** Read a server-sent event stream into one JSON result: the text, suggestions made, and the conversation. */
async function collect(res: Response) {
  const out: { conversationId?: string; text: string; proposals: { id: string; target: string }[]; events: unknown[]; error?: string; learnDue?: boolean } = { text: "", proposals: [], events: [] };
  const reader = res.body?.getReader();
  if (!reader) return out;
  const dec = new TextDecoder();
  let buf = "";
  const take = (chunk: string) => {
    const line = chunk.split("\n").find((l) => l.startsWith("data: "));
    if (!line) return;
    let e: Record<string, unknown>;
    try { e = JSON.parse(line.slice(6)); } catch { return; }
    if (e.type === "meta" && typeof e.conversationId === "string") out.conversationId = e.conversationId;
    else if (e.type === "text") out.text += String(e.text ?? "");
    else if (e.type === "proposal") out.proposals.push({ id: String(e.id), target: String(e.target) });
    else if (e.type === "error") out.error = String(e.code ?? "error");
    else if (e.type === "done") out.learnDue = Boolean(e.learnDue);
    else out.events.push(e);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 2); }
  }
  if (buf.trim()) take(buf);
  return out;
}

const redirectOf = (e: unknown): string | null => {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT") ? d.split(";")[2] ?? "" : null;
};

const FN_STATUS: Record<string, number> = { bad_request: 400, unauthorized: 403, forbidden: 403, not_allowed: 403, not_found: 404, conflict: 409, rate_limited: 429 };

export type ActionOutcome = { status: number; body: unknown };

/** Run one action as the key's identity (the caller already set it). */
export async function runApiAction(name: string, a: ApiAction, input: Input, ctx: ApiCtx, origin: string): Promise<ActionOutcome> {
  const locale = ["en", "fr", "es"].includes(String(input.locale)) ? String(input.locale) : ["en", "fr", "es"].includes(String(ctx.profile.locale)) ? String(ctx.profile.locale) : "en";
  if (a.kind === "fn") {
    if (a.needsPublish?.(input) && !ctx.key.canPublish) return { status: 403, body: { error: { code: "publish_not_allowed", message: "This key may not schedule or publish." } } };
    const r = await a.run(input) as { ok?: boolean; error?: string } | null;
    return { status: r && r.ok === false ? (FN_STATUS[String(r.error)] ?? 422) : 200, body: r ?? { ok: true } };
  }
  if (a.kind === "form") {
    const form = await a.form({ ...input, locale }, ctx);
    try { await a.run(form); return { status: 200, body: { ok: true } }; }
    catch (e) {
      const to = redirectOf(e);
      if (to === null) throw e;
      const err = new URL(to, origin).searchParams.get("error");
      return err ? { status: 422, body: { ok: false, error: err } } : { status: 200, body: { ok: true } };
    }
  }
  const req = new Request(`${origin}/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ ...input, locale }) });
  const res = await a.run(req);
  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) return { status: res.status, body: await res.json().catch(() => ({})) };
  const out = await collect(res);
  // The app asks the agent to learn from the conversation every few messages; do the same here.
  if (name === "agent_chat" && out.learnDue && out.conversationId) {
    await agentLearn.POST(new Request(`${origin}/api/agent/learn`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ clientId: input.clientId, conversationId: out.conversationId, locale }) })).catch(() => null);
  }
  return { status: out.error ? 502 : 200, body: out };
}
