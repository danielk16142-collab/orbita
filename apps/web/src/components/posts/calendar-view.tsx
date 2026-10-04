import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { groupByDate, iso, monthGrid, startOfWeek, addDays, type View } from "@orbita/content";
import { NETWORK_COLOR, NETWORK_LABEL, postTitle, type CalPost } from "./shared";

function Chip({ p, href, t, showClient, long }: { p: CalPost; href: string; t: Awaited<ReturnType<typeof getTranslations>>; showClient: boolean; long?: boolean }) {
  return (
    <Link href={href} className={`chip status-${p.status}`} title={`${NETWORK_LABEL[p.network] ?? p.network} · ${t(`formats.${p.type}` as never, { default: p.type } as never)} · ${t(`statuses.${p.status}`)}`}>
      <span className="swatch" style={{ background: NETWORK_COLOR[p.network] }} aria-hidden="true" />
      <span className="chip-text">
        {p.suggested_time && <span className="chip-time">{p.suggested_time}</span>} {postTitle(p, long ? 90 : 38)}
        {showClient && p.clients?.name && <span className="chip-client"> · {p.clients.name}</span>}
      </span>
      <span className="chip-status">{t(`statuses.${p.status}`)}</span>
    </Link>
  );
}

/** Month, week or day. Chips link to the post. On narrow screens the month becomes an agenda of the days that have posts. */
export async function CalendarView({ locale, view, anchor, posts, postHref, dayHref, showClient, today }: {
  locale: string; view: View; anchor: string; posts: CalPost[]; postHref: (id: string) => string; dayHref: (date: string) => string; showClient: boolean; today: string;
}) {
  const t = await getTranslations("posts");
  const by = groupByDate(posts);
  const wd = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const dayNum = (d: string) => Number(d.slice(8, 10));
  const label = (d: string) => long.format(new Date(`${d}T12:00:00Z`));

  if (view === "day") {
    const items = by.get(anchor) ?? [];
    return (
      <section className="card" aria-label={label(anchor)}>
        <h2>{label(anchor)}</h2>
        {items.length === 0 ? <p>{t("nothingPlanned")}</p> : <div className="day-list">{items.map((p) => (
          <article key={p.id} className="day-item">
            <Chip p={p} href={postHref(p.id)} t={t} showClient={showClient} long />
            {p.caption && <p className="day-caption">{p.caption.slice(0, 220)}{p.caption.length > 220 ? "…" : ""}</p>}
          </article>))}</div>}
      </section>
    );
  }

  const weeks = view === "week" ? [Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))] : monthGrid(anchor).weeks;
  const month = view === "month" ? monthGrid(anchor).month : null;
  const heads = weeks[0].map((d) => wd.format(new Date(`${d}T12:00:00Z`)));
  return (
    <section className={`cal cal-${view}`} aria-label={t("calendar")}>
      <div className="cal-head" aria-hidden="true">{heads.map((h) => <span key={h}>{h}</span>)}</div>
      {weeks.map((w) => (
        <div key={w[0]} className="cal-week">
          {w.map((d) => {
            const items = by.get(d) ?? [];
            const outside = month !== null && Number(d.slice(5, 7)) - 1 !== month;
            const max = view === "week" ? 20 : 3;
            return (
              <div key={d} className={`cal-day${items.length ? "" : " empty"}${d === today ? " today" : ""}${outside ? " outside" : ""}`}>
                <Link href={dayHref(d)} className="cal-date" aria-label={label(d)}><span className="cal-num">{dayNum(d)}</span><span className="cal-long">{label(d)}</span></Link>
                {items.slice(0, max).map((p) => <Chip key={p.id} p={p} href={postHref(p.id)} t={t} showClient={showClient} />)}
                {items.length > max && <Link href={dayHref(d)} className="cal-more">{t("more", { n: items.length - max })}</Link>}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
