import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CompetitorAnalysis, type CompetitorAnalysis as Analysis } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { competitorName, type CompetitorRow } from "@/lib/competitors";
import { WinsList, WIN_COLS, type WinRow } from "./wins-list";
import { AddWinForm, FetchPostsButtons } from "./wins";
import { scrapeTargets } from "@/lib/scrape-targets";
import { AnalyzeButton, CompetitorForm, IdeasPicker, RemoveCompetitorButton, UseInStrategyButton } from "./competitor-actions";

const LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", facebook: "Facebook", profile: "Profile" };
const COLS = "id, name, url, website, links, notes, last_researched_at";
const asRow = (r: Record<string, unknown>) => ({ ...r, links: Array.isArray(r.links) ? r.links : [] }) as CompetitorRow;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

function Links({ c }: { c: CompetitorRow }) {
  const all = [...(c.website ? [{ network: "website", url: c.website }] : []), ...(c.url ? [{ network: "profile", url: c.url }] : []), ...c.links];
  if (!all.length) return null;
  return <p className="link-chips">{all.map((l, i) => <a key={i} className="badge" href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.network === "website" ? host(l.url) : LABEL[l.network] ?? l.network}</a>)}</p>;
}

/** Competitors section: one card per competitor with the gist of its latest analysis; a click opens the full analysis. */
export async function CompetitorsPanel({ locale, clientId, detailBase, winChat }: { locale: string; clientId?: string; detailBase: string; winChat?: (idea: string) => string }) {
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { sb, clientId: id, profile } = access.actor;
  const [{ data: rows, error }, { data: analyses }, { data: wins }] = await Promise.all([
    sb.from("competitors").select(COLS).eq("client_id", id).order("created_at"),
    sb.from("competitor_analyses").select("competitor_id, analysis, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(200),
    sb.from("competitor_posts").select(WIN_COLS).eq("client_id", id).order("created_at", { ascending: false }).limit(500), // errors (migration not applied yet) just mean no wins
  ]);
  const latest = new Map<string, Analysis>();
  for (const a of analyses ?? []) if (!latest.has(a.competitor_id)) { const p = CompetitorAnalysis.safeParse(a.analysis); if (p.success) latest.set(a.competitor_id, p.data); }
  // A missing column means migration 0012 has not been applied to this database: say so instead of "no competitors".
  const setupNeeded = !!error && ["PGRST204", "PGRST205", "42703", "42P01"].includes(error.code ?? "");
  if (error) console.error(`competitors read failed: code=${error.code}`);
  return <CompetitorsView locale={locale} clientId={profile.role === "client" ? undefined : id} competitors={(rows ?? []).map(asRow)} latest={latest} detailBase={detailBase} setupNeeded={setupNeeded} wins={(wins ?? []) as WinRow[]} staff={profile.role !== "client"} winChat={winChat} />;
}

export async function CompetitorsView({ locale, clientId, competitors, latest, detailBase, setupNeeded = false, wins = [], staff = false, winChat }: { locale: string; clientId?: string; competitors: CompetitorRow[]; latest: Map<string, Analysis>; detailBase: string; setupNeeded?: boolean; wins?: WinRow[]; staff?: boolean; winChat?: (idea: string) => string }) {
  const t = await getTranslations("competitors");
  const tw = await getTranslations("wins");
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <div className="stack">
      <p className="stat-vs page-intro">{t("intro")}</p>
      {setupNeeded && <p className="card callout" role="alert">{t("errors.not_set_up")}</p>}
      {competitors.length === 0 && !setupNeeded && <p className="empty-note">{t("empty")}</p>}
      <div className="comp-grid">
        {competitors.map((c) => {
          const a = latest.get(c.id);
          return (
            <article key={c.id} className="card comp-card">
              <h2><Link href={`${detailBase}/${c.id}`}>{competitorName(c)}</Link></h2>
              <Links c={c} />
              <p className="stat-vs">{c.last_researched_at ? t("analyzedOn", { date: date.format(new Date(c.last_researched_at)) }) : t("notAnalyzed")}</p>
              {a && <p className="comp-gist">{a.summary}</p>}
              <Link className="btn small" href={`${detailBase}/${c.id}`}>{a ? t("openAnalysis") : t("openProfile")}</Link>
            </article>
          );
        })}
      </div>
      <CompetitorForm clientId={clientId} detailBase={detailBase} />
      {wins.length > 0 && (
        <section className="stack">
          <h2>{tw("swipeTitle")}</h2>
          <p className="stat-vs">{tw("swipeIntro")}</p>
          <WinsList rows={wins} names={Object.fromEntries(competitors.map((c) => [c.id, competitorName(c)]))} clientId={clientId} staff={staff} winChat={winChat} limit={12} />
        </section>
      )}
    </div>
  );
}

/** One competitor: profile, the latest analysis, and ways to use it for our content. */
export async function CompetitorDetailPanel({ locale, clientId, competitorId, listHref, chatHref, calendarHref, winChat }: {
  locale: string; clientId?: string; competitorId: string; listHref: string; chatHref: (name: string) => string; calendarHref: string; winChat?: (idea: string) => string;
}) {
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { sb, clientId: id, profile } = access.actor;
  const { data: row } = await sb.from("competitors").select(COLS).eq("id", competitorId).eq("client_id", id).maybeSingle();
  if (!row) notFound();
  const { data: a } = await sb.from("competitor_analyses").select("id, analysis, created_at").eq("competitor_id", competitorId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const parsed = a ? CompetitorAnalysis.safeParse(a.analysis) : null;
  const { data: wins } = await sb.from("competitor_posts").select(WIN_COLS).eq("competitor_id", competitorId).eq("client_id", id).order("created_at", { ascending: false }).limit(200);
  const c = asRow(row);
  return <CompetitorDetailView locale={locale} clientId={profile.role === "client" ? undefined : id} staff={profile.role !== "client"} competitor={c}
    analysis={parsed?.success ? { id: a!.id, createdAt: a!.created_at, data: parsed.data } : null} listHref={listHref} chatHref={chatHref(competitorName(c))} calendarHref={calendarHref} wins={(wins ?? []) as WinRow[]} winChat={winChat} />;
}

export async function CompetitorDetailView({ locale, clientId, staff, competitor: c, analysis, listHref, chatHref, calendarHref, wins = [], winChat }: {
  locale: string; clientId?: string; staff: boolean; competitor: CompetitorRow; analysis: { id: string; createdAt: string; data: Analysis } | null;
  listHref: string; chatHref: string; calendarHref: string; wins?: WinRow[]; winChat?: (idea: string) => string;
}) {
  const t = await getTranslations("competitors");
  const tw = await getTranslations("wins");
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const a = analysis?.data;
  const linkMap = Object.fromEntries(c.links.map((l) => [l.network, l.url]));
  return (
    <div className="stack">
      <section className="card">
        <div className="section-head">
          <div><Links c={c} />{c.notes && <p className="stat-vs">{c.notes}</p>}</div>
          <AnalyzeButton clientId={clientId} competitorId={c.id} locale={locale} again={!!a} />
        </div>
        <p className="stat-vs">{analysis ? t("analyzedOn", { date: date.format(new Date(analysis.createdAt)) }) : t("notAnalyzedLong")}</p>
      </section>

      <section className="card">
        <h2>{tw("title")}</h2>
        <p className="stat-vs">{tw("intro")}</p>
        <WinsList rows={wins} names={{}} clientId={clientId} staff={staff} winChat={winChat} />
        {staff && !!process.env.APIFY_TOKEN && <FetchPostsButtons clientId={clientId} competitorId={c.id} networks={Object.keys(scrapeTargets(c.links, c.url)) as ("instagram" | "tiktok")[]} />}
        <AddWinForm clientId={clientId} competitorId={c.id} />
      </section>

      {a && (
        <>
          <section className="card">
            <h2>{t("summary")}</h2>
            <p className="lead">{a.summary}</p>
            <div className="info-grid">
              {a.positioning && <div><h3>{t("positioning")}</h3><p>{a.positioning}</p></div>}
              {a.audience && <div><h3>{t("audience")}</h3><p>{a.audience}</p></div>}
              {a.posting_pattern && <div><h3>{t("postingPattern")}</h3><p>{a.posting_pattern}</p></div>}
            </div>
            <div className="info-grid">
              {a.content_pillars.length > 0 && <div><h3>{t("pillars")}</h3><ul>{a.content_pillars.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              {a.formats.length > 0 && <div><h3>{t("formats")}</h3><ul>{a.formats.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            </div>
          </section>

          <div className="info-grid three">
            {(["what_works", "weaknesses", "opportunities"] as const).map((k) => (
              <section key={k} className={`card audit-col ${k === "what_works" ? "strengths" : k}`}>
                <h3>{t(`parts.${k}`)}</h3>
                {a[k].length ? <ul>{a[k].map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="stat-vs">—</p>}
              </section>
            ))}
          </div>

          <section className="card use-card">
            <h2>{t("useTitle")}</h2>
            <p className="stat-vs">{t("useHint")}</p>
            <UseInStrategyButton clientId={clientId} analysisId={analysis!.id} chatHref={chatHref} />
            {a.content_ideas.length > 0 && (
              <>
                <h3 style={{ marginTop: "1.25rem" }}>{t("ideasTitle")}</h3>
                <IdeasPicker clientId={clientId} ideas={a.content_ideas} locale={locale} calendarHref={calendarHref} />
              </>
            )}
          </section>

          {(a.sources.length > 0 || a.confidence_note) && (
            <section className="card">
              <h3>{t("sources")}</h3>
              {a.confidence_note && <p className="stat-vs">{a.confidence_note}</p>}
              {a.sources.length > 0 && <ul>{a.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title || s.url}</a></li>)}</ul>}
            </section>
          )}
        </>
      )}

      <details className="card">
        <summary><strong>{t("editProfile")}</strong></summary>
        <CompetitorForm clientId={clientId} detailBase={listHref} initial={{ id: c.id, name: c.name ?? "", website: c.website ?? "", notes: c.notes ?? "", links: linkMap }} />
        {staff && <div style={{ marginTop: "1rem" }}><RemoveCompetitorButton clientId={clientId} id={c.id} listHref={listHref} /></div>}
      </details>
    </div>
  );
}
