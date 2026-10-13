import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BRIEF_SECTIONS, briefFromRow } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { completenessOf, loadClientContext, type ClientContext } from "@/lib/agent/context";
import { ProposalCard, type ProposalView } from "@/components/agent/proposal-card";
import { AddSourceForm, ArchiveMemoryButton, RemoveSourceButton } from "@/components/agent/small-actions";
import { CONTENT_TARGETS } from "@/components/agent/agent-workspace";
import { TimezoneForm } from "@/components/posts/timezone-form";
import { updateClientAction } from "@/app/[locale]/(agency)/clients/actions";

export type ProfileClient = { id: string; name: string; languages: string[]; markets: string[]; timezone: string | null };

/** Loads what the profile shows. Same access rules as the agent: staff for any client of the agency, client users for their own. */
export async function ProfilePanel({ locale, clientId, client, staff, flash, danger }: {
  locale: string; clientId?: string; client: ProfileClient; staff: boolean; flash?: { saved?: boolean; error?: string }; danger?: React.ReactNode;
}) {
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { actor } = access;
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const { data: pending } = await actor.sb.from("proposals").select("id, target, payload, reason").eq("client_id", actor.clientId).eq("status", "pending").order("created_at", { ascending: false }).limit(30);
  const knowledge = ((pending ?? []) as unknown as ProposalView[]).filter((p) => !CONTENT_TARGETS.includes(p.target));
  return <ProfileView locale={locale} client={client} ctx={ctx} proposals={knowledge} staff={staff} clientId={staff ? actor.clientId : undefined} flash={flash} danger={danger} />;
}

const PROFILE_URL: Record<string, (h: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}`, tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`, facebook: (h) => `https://www.facebook.com/${h}`,
};
const linkFor = (s: ClientContext["sources"][number]) => s.url ?? (s.handle && PROFILE_URL[s.kind] ? PROFILE_URL[s.kind](encodeURIComponent(s.handle)) : null);

/** The client's profile: business details, links, and everything the agent has learned about the brand. */
export async function ProfileView({ locale, client, ctx, proposals, staff, clientId, flash, danger }: {
  locale: string; client: ProfileClient; ctx: Pick<ClientContext, "briefRow" | "memories" | "sources" | "proofItems" | "rules">;
  proposals: ProposalView[]; staff: boolean; clientId?: string; flash?: { saved?: boolean; error?: string }; danger?: React.ReactNode;
}) {
  const t = await getTranslations("profile");
  const ta = await getTranslations("agent");
  const tc = await getTranslations("common");
  const tcl = await getTranslations("clients");
  const { score, missing } = completenessOf(ctx as ClientContext);
  const brief = briefFromRow(ctx.briefRow);
  return (
    <div className="profile-grid">
      <div className="stack">
        <section className="card">
          <h2>{t("business")}</h2>
          {flash?.saved && <p role="status" className="ok">{tc("saved")}</p>}
          {flash?.error === "details" && <p className="error" role="alert">{t("detailsError")}</p>}
          {staff ? (
            <form action={updateClientAction}>
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={client.id} />
              <label htmlFor="p-name">{tcl("name")}</label>
              <input id="p-name" name="name" required maxLength={120} defaultValue={client.name} />
              <fieldset className="checks">
                <legend>{tcl("languages")}</legend>
                {(["en", "fr", "es"] as const).map((l) => (
                  <label key={l} className="check"><input type="checkbox" name="languages" value={l} defaultChecked={client.languages.includes(l)} /> {l.toUpperCase()}</label>
                ))}
              </fieldset>
              <label htmlFor="p-markets">{tcl("markets")}</label>
              <input id="p-markets" name="markets" maxLength={300} defaultValue={client.markets.join(", ")} />
              <small>{tcl("marketsHint")}</small>
              <div><button className="btn" style={{ marginTop: "1rem" }}>{tc("save")}</button></div>
            </form>
          ) : (
            <dl className="facts">
              <div><dt>{tcl("name")}</dt><dd>{client.name}</dd></div>
              <div><dt>{tcl("languages")}</dt><dd>{client.languages.join(", ").toUpperCase()}</dd></div>
              <div><dt>{tcl("markets")}</dt><dd>{client.markets.join(", ") || "—"}</dd></div>
              <div><dt>{t("timezone")}</dt><dd>{client.timezone ?? "UTC"}</dd></div>
            </dl>
          )}
          {staff && <div className="tz-row"><TimezoneForm clientId={client.id} value={client.timezone ?? "UTC"} /></div>}
        </section>

        <section className="card">
          <h2>{t("links")}</h2>
          <p className="stat-vs">{t("linksHint")}</p>
          {ctx.sources.length ? (
            <ul className="plain links-list">{ctx.sources.map((s) => {
              const href = linkFor(s);
              return (
                <li key={s.id}>
                  <span className="link-kind">{t(`kinds.${s.kind}`)}</span>
                  <span className="link-value">{href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">{s.url ?? `@${s.handle}`}</a> : `@${s.handle}`}</span>
                  <RemoveSourceButton id={s.id} clientId={clientId} />
                </li>
              );
            })}</ul>
          ) : <p>{ta("noSources")}</p>}
          <AddSourceForm clientId={clientId} />
        </section>

        <section className="card">
          <h2>{ta("brief")}</h2>
          <p className="stat-vs">{t("briefHint")}</p>
          <div className="brief-list">
            {BRIEF_SECTIONS.map((s) => {
              const v = brief[s];
              const empty = !v || (Array.isArray(v) && v.length === 0);
              return (
                <details key={s} open={!empty}>
                  <summary>{ta(`sections.${s}`)}{empty && <small className="inline"> · {ta("notKnown")}</small>}</summary>
                  {Array.isArray(v) ? <ul>{v.map((x, i) => <li key={i}>{x}</li>)}</ul> : v ? <p>{v}</p> : null}
                </details>
              );
            })}
          </div>
        </section>

        {(ctx.proofItems.length > 0 || ctx.rules.length > 0) && (
          <section className="card">
            {ctx.proofItems.length > 0 && <><h2>{t("proof")}</h2><ul>{ctx.proofItems.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
            {ctx.rules.length > 0 && <><h2>{t("rules")}</h2><ul>{ctx.rules.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          </section>
        )}
      </div>

      <aside className="stack">
        <section className="card">
          <p className="eyebrow">{ta("completeness")}</p>
          <div className="meter" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={ta("completeness")}><span style={{ width: `${score}%` }} /></div>
          <p><strong>{score}%</strong>{missing.length > 0 && <> · {ta("missing")}: {missing.slice(0, 4).map((m) => ta(`sections.${m}`)).join(", ")}</>}</p>
        </section>
        <section className="card">
          <h2>{t("toReview")}</h2>
          {proposals.length ? proposals.map((p) => <ProposalCard key={p.id} clientId={clientId} proposal={p} />) : <p className="stat-vs">{ta("noSuggestions")}</p>}
        </section>
        <section className="card">
          <h2>{ta("memories")}</h2>
          {ctx.memories.length ? <ul className="plain">{ctx.memories.map((m) => <li key={m.id}><span><strong>{ta(`memoryKinds.${m.kind}`)}</strong> {m.content}</span><ArchiveMemoryButton id={m.id} clientId={clientId} /></li>)}</ul> : <p className="stat-vs">{ta("noMemories")}</p>}
        </section>
        {danger}
      </aside>
    </div>
  );
}
