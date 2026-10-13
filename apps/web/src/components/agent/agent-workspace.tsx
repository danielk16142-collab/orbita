import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ONBOARDING_THRESHOLD } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { completenessOf, loadClientContext } from "@/lib/agent/context";
import { askText, type AskQuery } from "@/lib/agent/asks";
import { Tabs } from "@/components/tabs";
import { AgentChat } from "./agent-chat";
import type { ProposalView } from "./proposal-card";
import { AuditView, ContentSuggestions, ProfileNudge, StrategyView } from "./agent-views";
import { AgentHistory } from "./agent-history";
import { StrategyMap } from "@/components/strategy/strategy-map";
import { StrategyMindMap } from "@/components/strategy/strategy-mind-map";
import { loadStrategyMap } from "@/lib/strategy-map";
import { localDay } from "@/lib/cadence";
import { isCurrent, latestThread, recentHandovers } from "@/lib/agent/threads";

const shiftMonth = (month: string, n: number) => { const d = new Date(Date.parse(`${month}-01T00:00:00Z`)); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

export const AGENT_VIEWS = ["chat", "strategy", "audit", "history"] as const;
export type AgentView = (typeof AGENT_VIEWS)[number];
export const agentViewOf = (v?: string): AgentView => ((AGENT_VIEWS as readonly string[]).includes(v ?? "") ? (v as AgentView) : "chat");
/** Suggestions about content stay with the agent; suggestions about the brand itself are reviewed on the Profile. */
export const CONTENT_TARGETS = ["plan", "post", "strategy"];

/**
 * The agent for one client: chat, content strategy, and the audit of its online presence.
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

  if (view === "strategy") {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? query.month! : localDay(actor.client.timezone ?? "UTC").slice(0, 7);
    const data = await loadStrategyMap(actor, month);
    const postsBase = cid ? `/${locale}/posts` : `/${locale}/portal/posts`;
    const newPostHref = cid ? `${postsBase}/new?client=${cid}` : `${postsBase}/new`;
    const layout = query.layout === "calendar" ? "calendar" : "mind";
    return (
      <>
        {tabs}
        {data.strategy && (
          <nav className="map-views" aria-label={t("strategyViews")}>
            <Link className="btn small ghost" aria-current={layout === "mind" ? "page" : undefined} href={hrefFor("strategy", { layout: "mind", month })}>{t("mindMap")}</Link>
            <Link className="btn small ghost" aria-current={layout === "calendar" ? "page" : undefined} href={hrefFor("strategy", { layout: "calendar", month })}>{t("calendarMap")}</Link>
          </nav>
        )}
        {layout === "mind" && data.strategy
          ? <StrategyMindMap data={data} locale={locale} clientId={cid} postsBase={postsBase} newPostHref={newPostHref} />
          : <StrategyMap data={data} locale={locale} clientId={cid} postsBase={postsBase} newPostHref={newPostHref}
              prevMonthHref={hrefFor("strategy", { month: shiftMonth(month, -1), layout: "calendar" })} nextMonthHref={hrefFor("strategy", { month: shiftMonth(month, 1), layout: "calendar" })} askStrategyHref={askHref("strategy")} />}
        {ctx.strategy && <details className="card map-details"><summary><strong>{t("strategyDetails")}</strong></summary><StrategyView locale={locale} strategy={ctx.strategy} askHref={askHref} /></details>}
      </>
    );
  }
  if (view === "audit") return <>{tabs}<AuditView locale={locale} audit={ctx.audit} sources={ctx.sources} askHref={askHref} profileHref={profileHref} /></>;
  if (view === "history") return <>{tabs}<AgentHistory actor={actor} locale={locale} thread={query.thread} hrefFor={(thread) => hrefFor("history", thread ? { thread } : {})} /></>;

  const { score, missing } = completenessOf(ctx);
  // One thread per day: continue today's open thread; otherwise start fresh and close the previous one in the background.
  const [latest, handovers, { data: pending }] = await Promise.all([
    latestThread(actor),
    recentHandovers(actor, null, 1),
    actor.sb.from("proposals").select("id, target, payload, reason").eq("client_id", actor.clientId).eq("status", "pending").order("created_at", { ascending: false }).limit(30),
  ]);
  const conv = latest && isCurrent(latest, actor.client.timezone ?? "UTC") ? latest : null;
  const closePrevious = latest && !conv && latest.summary === null ? latest.id : null;
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
        <AgentChat key={`${conv?.id ?? "new"}|${query.ask ?? ""}`} locale={locale} clientId={cid} initialMessages={initial} initialConversationId={conv?.id ?? null}
          onboarding={score < ONBOARDING_THRESHOLD} initialInput={askText(query, t, tp)}
          closePrevious={closePrevious} historyHref={hrefFor("history")} hasEarlier={handovers.length > 0 || !!closePrevious} />
        <aside className="agent-side">
          <ContentSuggestions proposals={content} clientId={cid} />
          <ProfileNudge score={score} missing={missing} pendingKnowledge={all.length - content.length} profileHref={profileHref} />
        </aside>
      </div>
    </>
  );
}
