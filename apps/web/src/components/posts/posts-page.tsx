import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { addDays, iso, navigate, rangeFor, validDate, VIEWS, type View } from "@orbita/content";
import { requireStaff, requireUser } from "@/lib/session";
import { CalendarView } from "./calendar-view";
import { PostList, type ListPost } from "./post-list";
import { NETWORK_LABEL, postTitle, type CalPost } from "./shared";
import { DeletePostButton } from "./delete-post-button";
import { ChannelTabs, CHANNEL_COOKIE } from "./channel-tabs";
import { LanguageTabs } from "@/components/language-tabs";
import { CONTENT_LANGUAGES, isContentLanguage, languageTabs, strategyLanguage } from "@/lib/languages";

type SP = { view?: string; date?: string; client?: string; network?: string; status?: string; lang?: string };
const STATUS_FILTERS = ["idea", "draft", "approved", "scheduled", "published"];
/** One calendar per channel; "all" shows every network together. YouTube and Facebook posts appear under "all". */
const CHANNELS = ["instagram", "tiktok", "linkedin"];

/** The posts calendar for the agency (all clients, filterable) or a client portal (own client). */
export async function PostsPage({ locale, searchParams, portal }: { locale: string; searchParams: SP; portal: boolean }) {
  const t = await getTranslations("posts");
  const s = portal ? await requireUser(locale) : await requireStaff(locale);
  const base = portal ? `/${locale}/portal/posts` : `/${locale}/posts`;
  const today = iso(new Date());
  const view: View = (VIEWS as readonly string[]).includes(searchParams.view ?? "") ? (searchParams.view as View) : "month";
  const anchor = validDate(searchParams.date) ? searchParams.date : today;
  const { from, to } = rangeFor(view, anchor);
  // The channel comes from the link, else the last one chosen (cookie), else Instagram.
  const asked = searchParams.network ?? (await cookies()).get(CHANNEL_COOKIE)?.value ?? "instagram";
  const network = NETWORK_LABEL[asked] ? asked : "";
  const status = STATUS_FILTERS.includes(searchParams.status ?? "") ? searchParams.status! : "";
  const clientFilter = !portal && /^[0-9a-f-]{36}$/i.test(searchParams.client ?? "") ? searchParams.client! : "";
  // One calendar per language. For one client (or the portal) it opens on the client's first language; across all clients
  // it shows every language unless one is picked. "all" in the link shows every language.
  const oneClient = portal ? s.profile.client_id : clientFilter || null;
  const { data: own } = oneClient ? await s.sb.from("clients").select("languages").eq("id", oneClient).maybeSingle() : { data: null };
  const ownLangs = (own?.languages as string[] | undefined) ?? null;
  const lang = isContentLanguage(searchParams.lang) ? searchParams.lang : searchParams.lang === "all" || !oneClient ? "" : strategyLanguage(null, ownLangs);

  const cols = "id, client_id, network, type, status, planned_date, suggested_time, idea, caption, clients(name)";
  let q = s.sb.from("posts").select(view === "list" ? `${cols}, content, hashtags` : cols).gte("planned_date", from).lte("planned_date", to).order("planned_date").limit(1000);
  if (network) q = q.eq("network", network); if (status) q = q.eq("status", status); if (clientFilter) q = q.eq("client_id", clientFilter); if (lang) q = q.eq("language", lang);
  const { data: posts } = await q;
  // List view shows a cover for each post: the first image attached to it (generated or uploaded), signed for an hour.
  let listPosts: ListPost[] = [];
  if (view === "list") {
    const rows = (posts ?? []) as unknown as ListPost[];
    const { data: media } = rows.length ? await s.sb.from("post_media").select("post_id, path, kind, page, created_at").in("post_id", rows.map((r) => r.id)).order("page").order("created_at") : { data: [] };
    const first = new Map<string, string>(); const video = new Set<string>();
    for (const m of media ?? []) { if (m.kind === "video") video.add(m.post_id); else if (!first.has(m.post_id)) first.set(m.post_id, m.path); }
    const signed = first.size ? await s.sb.storage.from("post-media").createSignedUrls([...first.values()], 3600) : { data: [] };
    const urlByPath = new Map((signed.data ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
    listPosts = rows.map((r) => ({ ...r, thumb: urlByPath.get(first.get(r.id) ?? "") ?? null, hasVideo: video.has(r.id) }));
  }
  let u = s.sb.from("posts").select("id, client_id, network, type, status, planned_date, suggested_time, idea, caption, clients(name)").is("planned_date", null).not("status", "in", "(published,publishing)").order("created_at", { ascending: false }).limit(20); // published posts are done: not "to schedule"
  if (network) u = u.eq("network", network); if (status) u = u.eq("status", status); if (clientFilter) u = u.eq("client_id", clientFilter); if (lang) u = u.eq("language", lang);
  const { data: unscheduled } = await u;
  const { data: clients } = portal ? { data: [] as { id: string; name: string }[] } : await s.sb.from("clients").select("id, name").order("name");

  const qs = (over: Record<string, string>) => `${base}?${new URLSearchParams({ view, date: anchor, ...(clientFilter && { client: clientFilter }), network: network || "all", lang: lang || "all", ...(status && { status }), ...over })}`;
  const channels = [...CHANNELS, ...(network && !CHANNELS.includes(network) ? [network] : []), "all"].map((k) => ({ key: k, label: k === "all" ? t("allChannels") : NETWORK_LABEL[k], href: qs({ network: k }) }));
  const title = new Intl.DateTimeFormat(locale, view === "day" ? { dateStyle: "full", timeZone: "UTC" } : view === "week" ? { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T12:00:00Z`));
  const exportQs = new URLSearchParams({ from, to, ...(clientFilter && { client: clientFilter }), ...(network && { network }), ...(status && { status }), ...(lang && { language: lang }) });

  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <div className="page-head">
        <h1>{t("title")}</h1>
        <Link className="btn" href={`${base}/new?${new URLSearchParams({ ...(clientFilter && { client: clientFilter }), ...(view === "day" && { date: anchor }), ...(network && { network }), ...(lang && { lang }) })}`}>+ {t("createPost")}</Link>
      </div>
      <LanguageTabs langs={oneClient ? languageTabs(ownLangs) : CONTENT_LANGUAGES} current={lang || null} locale={locale} label={t("languageTabs")}
        hrefFor={(l) => qs({ lang: l })} allHref={qs({ lang: "all" })} allLabel={t("allLanguages")} />
      <ChannelTabs items={channels} current={network || "all"} label={t("channels")} />
      <div className="cal-toolbar">
        <div className="cal-nav" role="group" aria-label={t("navigate")}>
          <Link className="btn ghost small" href={qs({ date: navigate(view, anchor, -1) })} aria-label={t("previous")}>←</Link>
          <Link className="btn ghost small" href={qs({ date: today })}>{t("today")}</Link>
          <Link className="btn ghost small" href={qs({ date: navigate(view, anchor, 1) })} aria-label={t("next")}>→</Link>
          <strong className="cal-title" aria-live="polite">{title}</strong>
        </div>
        <div className="cal-nav" role="group" aria-label={t("view")}>
          {VIEWS.map((v) => <Link key={v} href={qs({ view: v })} className={`btn small ${v === view ? "" : "ghost"}`} aria-current={v === view ? "page" : undefined}>{t(`views.${v}`)}</Link>)}
        </div>
      </div>
      <form method="get" className="cal-filters">
        <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={anchor} />
        {!portal && <label>{t("client")}<select name="client" defaultValue={clientFilter}><option value="">{t("all")}</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <input type="hidden" name="network" value={network || "all"} /><input type="hidden" name="lang" value={lang || "all"} />
        <label>{t("status")}<select name="status" defaultValue={status}><option value="">{t("all")}</option>{STATUS_FILTERS.map((x) => <option key={x} value={x}>{t(`statuses.${x}`)}</option>)}</select></label>
        <button className="btn small">{t("filter")}</button>
        <a className="btn ghost small" href={`/api/posts/export?${exportQs}`} download>{t("exportCsv")}</a>
      </form>

      {view === "list"
        ? <PostList locale={locale} posts={listPosts} today={today} showClient={!portal} canDelete={!portal} postHref={(id) => `${base}/${id}`} />
        : <CalendarView locale={locale} view={view} anchor={anchor} posts={(posts ?? []) as unknown as CalPost[]} today={today} showClient={!portal} canDelete={!portal}
            postHref={(id) => `${base}/${id}`} dayHref={(d) => qs({ view: "day", date: d })} />}

      {(unscheduled?.length ?? 0) > 0 && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <h2>{t("unscheduled")}</h2>
          <ul className="plain unscheduled-list">{(unscheduled as unknown as CalPost[]).map((p) => (
            <li key={p.id}>
              <span className="unscheduled-text"><Link href={`${base}/${p.id}`}>{(p.idea || p.caption || "—").slice(0, 80)}</Link><span className="stat-vs">{!portal && p.clients?.name ? `${p.clients.name} · ` : ""}{NETWORK_LABEL[p.network] ?? p.network} · {t(`statuses.${p.status}`)}</span></span>
              {!portal && <DeletePostButton postId={p.id} title={postTitle(p, 60)} />}
            </li>))}</ul>
        </section>
      )}
    </>
  );
}
