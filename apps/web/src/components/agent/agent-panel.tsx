import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BRIEF_SECTIONS, briefFromRow, ONBOARDING_THRESHOLD } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { completenessOf, loadClientContext } from "@/lib/agent/context";
import { AgentChat } from "./agent-chat";
import { ProposalCard, type ProposalView } from "./proposal-card";
import { AddSourceForm, ArchiveMemoryButton, DeleteResearchButton, RemoveSourceButton } from "./small-actions";

/** Chat plus everything the agent knows about one client. Used by the agency (client tab) and the client portal. */
export async function AgentPanel({ locale, clientId }: { locale: "en" | "fr" | "es"; clientId?: string }) {
  const t = await getTranslations("agent");
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { actor } = access;
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const { score, missing } = completenessOf(ctx);
  const brief = briefFromRow(ctx.briefRow);

  const { data: conv } = await actor.sb.from("conversations").select("id").eq("client_id", actor.clientId).eq("created_by", actor.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: msgs } = conv
    ? await actor.sb.from("messages").select("role, content").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(60)
    : { data: [] as { role: string; content: unknown }[] };
  const initial = (msgs ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", text: String((m.content as { text?: string }).text ?? "") })).filter((m) => m.text);

  const { data: pending } = await actor.sb.from("proposals").select("id, target, payload, reason").eq("client_id", actor.clientId).eq("status", "pending").order("created_at", { ascending: false }).limit(20);
  const cid = actor.profile.role === "client" ? undefined : actor.clientId; // client users never send an id: the server pins it

  return (
    <div className="agent-grid">
      <AgentChat locale={locale} clientId={cid} initialMessages={initial} initialConversationId={conv?.id ?? null} onboarding={score < ONBOARDING_THRESHOLD} />
      <aside className="agent-side">
        <section className="card">
          <p className="eyebrow">{t("completeness")}</p>
          <div className="meter" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={t("completeness")}><span style={{ width: `${score}%` }} /></div>
          <p><strong>{score}%</strong>{missing.length > 0 && <> · {t("missing")}: {missing.slice(0, 4).map((m) => t(`sections.${m}`)).join(", ")}</>}</p>
        </section>

        <section className="card">
          <h2>{t("suggestions")}</h2>
          {pending?.length ? pending.map((p) => <ProposalCard key={p.id} clientId={cid} proposal={p as unknown as ProposalView} />) : <p>{t("noSuggestions")}</p>}
        </section>

        <section className="card">
          <h2>{t("strategy")}</h2>
          {ctx.strategy ? (() => {
            const c = ctx.strategy.content as { objectives?: string[]; pillars?: { name: string; share_percent: number }[]; cadence?: { network: string; posts_per_week: number; best_days: string[]; best_time: string }[]; topics?: string[] };
            return (<>
              <p><strong>{ctx.strategy.title}</strong> · {t(`periods.${ctx.strategy.period}`)}</p>
              {c.objectives?.length ? <details open><summary>{t("objectives")}</summary><ul>{c.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></details> : null}
              {c.pillars?.length ? <details><summary>{t("pillars")}</summary><ul>{c.pillars.map((x, i) => <li key={i}>{x.name} ({x.share_percent}%)</li>)}</ul></details> : null}
              {c.cadence?.length ? <details><summary>{t("cadence")}</summary><ul>{c.cadence.map((x, i) => <li key={i}>{x.network}: {x.posts_per_week}/{t("perWeek")} · {x.best_days.map((d) => t(`days.${d}`)).join(", ")} {x.best_time}</li>)}</ul></details> : null}
              {c.topics?.length ? <details><summary>{t("topics")}</summary><ul>{c.topics.map((x, i) => <li key={i}>{x}</li>)}</ul></details> : null}
            </>);
          })() : <p>{t("noStrategy")}</p>}
        </section>

        <section className="card">
          <h2>{t("research")}</h2>
          {ctx.research.length ? <ul className="plain">{ctx.research.map((r) => (
            <li key={r.id}><details><summary><strong>{r.kind}</strong> {r.title}</summary><p>{r.summary}</p>{r.sources.length > 0 && <ul>{r.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title || s.url}</a></li>)}</ul>}</details><DeleteResearchButton id={r.id} clientId={cid} /></li>
          ))}</ul> : <p>{t("noResearch")}</p>}
          <small>{t("researchHint")}</small>
        </section>

        <section className="card">
          <h2>{t("sources")}</h2>
          {ctx.sources.length ? <ul className="plain">{ctx.sources.map((s) => <li key={s.id}><span><strong>{s.kind}</strong> {s.url ?? `@${s.handle}`}</span><RemoveSourceButton id={s.id} clientId={cid} /></li>)}</ul> : <p>{t("noSources")}</p>}
          <AddSourceForm clientId={cid} />
        </section>

        <section className="card">
          <h2>{t("audit")}</h2>
          {ctx.audit ? (
            <>
              <p>{ctx.audit.summary}</p>
              {(["strengths", "weaknesses", "opportunities"] as const).map((k) => ctx.audit![k].length > 0 && <details key={k}><summary>{t(`auditParts.${k}`)}</summary><ul>{ctx.audit![k].map((x, i) => <li key={i}>{x}</li>)}</ul></details>)}
              {ctx.audit.social_notes && <details><summary>{t("auditParts.social")}</summary><p>{ctx.audit.social_notes}</p></details>}
            </>
          ) : <p>{t("noAudit")}</p>}
        </section>

        <section className="card">
          <h2>{t("memories")}</h2>
          {ctx.memories.length ? <ul className="plain">{ctx.memories.map((m) => <li key={m.id}><span><strong>{t(`memoryKinds.${m.kind}`)}</strong> {m.content}</span><ArchiveMemoryButton id={m.id} clientId={cid} /></li>)}</ul> : <p>{t("noMemories")}</p>}
        </section>

        <section className="card">
          <h2>{t("brief")}</h2>
          {BRIEF_SECTIONS.map((s) => { const v = brief[s]; return <details key={s}><summary>{t(`sections.${s}`)}{!v && <small> · {t("notKnown")}</small>}</summary>{Array.isArray(v) ? <ul>{v.map((x, i) => <li key={i}>{x}</li>)}</ul> : v ? <p>{v}</p> : null}</details>; })}
        </section>
      </aside>
    </div>
  );
}
