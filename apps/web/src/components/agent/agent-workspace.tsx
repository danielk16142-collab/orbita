import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ONBOARDING_THRESHOLD } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { completenessOf, loadClientContext } from "@/lib/agent/context";
import { askText, type AskQuery } from "@/lib/agent/asks";
import { Tabs } from "@/components/tabs";
import { AgentChat } from "./agent-chat";
import type { ProposalView } from "./proposal-card";
import { AuditView, ContentSuggestions, ProfileNudge, StrategyResearchView } from "./agent-views";

export const AGENT_VIEWS = ["chat", "strategy", "audit"] as const;
export type AgentView = (typeof AGENT_VIEWS)[number];
export const agentViewOf = (v?: string): AgentView => ((AGENT_VIEWS as readonly string[]).includes(v ?? "") ? (v as AgentView) : "chat");
/** Suggestions about content stay with the agent; suggestions about the brand itself are reviewed on the Profile. */
export const CONTENT_TARGETS = ["plan", "post", "strategy"];

/**
 * The agent for one client: chat, content strategy and research, and the audit of its online presence.
 * Used by the agency (Agent section and the client's Agent tab) and the client portal.
 */
export async function AgentWorkspace({ locale, clientId, view, query, hrefFor, profileHref }: {
  locale: "en" | "fr" | "es"; clientId?: string; view: AgentView; query: AskQuery;
  /** Link to a view of this workspace, optionally with a prepared request for the chat. */
  hrefFor: (view: AgentView, extra?: Record<string, string>) => string;
  profileHref: string;
}) {
  const t = await getTranslations("agent");
  const tp = await getTranslations("posts");
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { actor } = access;
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const cid = actor.profile.role === "client" ? undefined : actor.clientId; // client users never send an id: the server pins it
  const askHref = (ask: string) => hrefFor("chat", { ask });

  const tabs = <Tabs sub label={t("title")} current={view} items={AGENT_VIEWS.map((v) => ({ key: v, label: t(`views.${v}`), href: hrefFor(v) }))} />;

  if (view === "strategy") return <>{tabs}<StrategyResearchView locale={locale} strategy={ctx.strategy} research={ctx.research} clientId={cid} askHref={askHref} /></>;
  if (view === "audit") return <>{tabs}<AuditView locale={locale} audit={ctx.audit} sources={ctx.sources} askHref={askHref} profileHref={profileHref} /></>;

  const { score, missing } = completenessOf(ctx);
  const [{ data: conv }, { data: pending }] = await Promise.all([
    actor.sb.from("conversations").select("id").eq("client_id", actor.clientId).eq("created_by", actor.userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    actor.sb.from("proposals").select("id, target, payload, reason").eq("client_id", actor.clientId).eq("status", "pending").order("created_at", { ascending: false }).limit(30),
  ]);
  const { data: msgs } = conv
    ? await actor.sb.from("messages").select("role, content").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(60)
    : { data: [] as { role: string; content: unknown }[] };
  const initial = (msgs ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", text: String((m.content as { text?: string }).text ?? "") })).filter((m) => m.text);
  const all = (pending ?? []) as unknown as ProposalView[];
  const content = all.filter((p) => CONTENT_TARGETS.includes(p.target));

  return (
    <>
      {tabs}
      <div className="agent-grid">
        <AgentChat key={query.ask ?? "chat"} locale={locale} clientId={cid} initialMessages={initial} initialConversationId={conv?.id ?? null}
          onboarding={score < ONBOARDING_THRESHOLD} initialInput={askText(query, t, tp)} />
        <aside className="agent-side">
          <ContentSuggestions proposals={content} clientId={cid} />
          <ProfileNudge score={score} missing={missing} pendingKnowledge={all.length - content.length} profileHref={profileHref} />
        </aside>
      </div>
    </>
  );
}
