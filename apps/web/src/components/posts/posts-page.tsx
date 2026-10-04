import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { addDays, iso, navigate, rangeFor, validDate, VIEWS, type View } from "@orbita/content";
import { requireStaff, requireUser } from "@/lib/session";
import { CalendarView } from "./calendar-view";
import { NewPostForm } from "./new-post-form";
import { NETWORK_LABEL, type CalPost } from "./shared";

type SP = { view?: string; date?: string; client?: string; network?: string; status?: string };
const STATUS_FILTERS = ["idea", "draft", "approved", "scheduled", "published"];

/** The posts calendar for the agency (all clients, filterable) or a client portal (own client). */
export async function PostsPage({ locale, searchParams, portal }: { locale: string; searchParams: SP; portal: boolean }) {
  const t = await getTranslations("posts");
  const s = portal ? await requireUser(locale) : await requireStaff(locale);
  const base = portal ? `/${locale}/portal/posts` : `/${locale}/posts`;
  const today = iso(new Date());
  const view: View = (VIEWS as readonly string[]).includes(searchParams.view ?? "") ? (searchParams.view as View) : "month";
  const anchor = validDate(searchParams.date) ? searchParams.date : today;
  const { from, to } = rangeFor(view, anchor);
  const network = NETWORK_LABEL[searchParams.network ?? ""] ? searchParams.network! : "";
  const status = STATUS_FILTERS.includes(searchParams.status ?? "") ? searchParams.status! : "";
  const clientFilter = !portal && /^[0-9a-f-]{36}$/i.test(searchParams.client ?? "") ? searchParams.client! : "";

  let q = s.sb.from("posts").select("id, client_id, network, type, status, planned_date, suggested_time, idea, caption, clients(name)").gte("planned_date", from).lte("planned_date", to).order("planned_date").limit(1000);
  if (network) q = q.eq("network", network); if (status) q = q.eq("status", status); if (clientFilter) q = q.eq("client_id", clientFilter);
  const { data: posts } = await q;
  let u = s.sb.from("posts").select("id, client_id, network, type, status, planned_date, suggested_time, idea, caption, clients(name)").is("planned_date", null).order("created_at", { ascending: false }).limit(20);
  if (network) u = u.eq("network", network); if (status) u = u.eq("status", status); if (clientFilter) u = u.eq("client_id", clientFilter);
  const { data: unscheduled } = await u;
  const { data: clients } = portal ? { data: [] as { id: string; name: string }[] } : await s.sb.from("clients").select("id, name").order("name");

  const qs = (over: Record<string, string>) => `${base}?${new URLSearchParams({ view, date: anchor, ...(clientFilter && { client: clientFilter }), ...(network && { network }), ...(status && { status }), ...over })}`;
  const title = new Intl.DateTimeFormat(locale, view === "day" ? { dateStyle: "full", timeZone: "UTC" } : view === "week" ? { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T12:00:00Z`));
  const exportQs = new URLSearchParams({ from, to, ...(clientFilter && { client: clientFilter }), ...(network && { network }), ...(status && { status }) });

  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
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
        <label>{t("network")}<select name="network" defaultValue={network}><option value="">{t("all")}</option>{Object.entries(NETWORK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>{t("status")}<select name="status" defaultValue={status}><option value="">{t("all")}</option>{STATUS_FILTERS.map((x) => <option key={x} value={x}>{t(`statuses.${x}`)}</option>)}</select></label>
        <button className="btn small">{t("filter")}</button>
        <a className="btn ghost small" href={`/api/posts/export?${exportQs}`} download>{t("exportCsv")}</a>
      </form>

      <CalendarView locale={locale} view={view} anchor={anchor} posts={(posts ?? []) as unknown as CalPost[]} today={today} showClient={!portal}
        postHref={(id) => `${base}/${id}`} dayHref={(d) => qs({ view: "day", date: d })} />

      {(unscheduled?.length ?? 0) > 0 && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <h2>{t("unscheduled")}</h2>
          <ul className="plain">{(unscheduled as unknown as CalPost[]).map((p) => <li key={p.id}><Link href={`${base}/${p.id}`}>{(p.idea || p.caption || "—").slice(0, 80)}</Link><span className="stat-vs">{!portal && p.clients?.name ? `${p.clients.name} · ` : ""}{NETWORK_LABEL[p.network] ?? p.network} · {t(`statuses.${p.status}`)}</span></li>)}</ul>
        </section>
      )}
      <div style={{ marginTop: "1.25rem" }}>
        <NewPostForm locale={locale} staff={!portal} clients={clients ?? []} postHref={(id) => `${base}/${id}`} defaultDate={view === "day" ? anchor : ""} />
      </div>
    </>
  );
}
