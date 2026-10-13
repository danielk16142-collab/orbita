import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { dashboardFor, loadAnalyticsData } from "@/lib/analytics/load";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { loadCadence } from "@/lib/cadence";

/** Agency Home: every client's headline numbers, and the full dashboard for the one you open. */
export default async function Dashboard({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ client?: string }> }) {
  const { locale } = await params;
  const { client: clientId } = await searchParams;
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("cadence");
  const { sb } = await requireStaff(locale);
  const nf = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const pf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  if (clientId && /^[0-9a-f-]{36}$/i.test(clientId)) {
    const { data: client } = await sb.from("clients").select("id, name").eq("id", clientId).maybeSingle();
    if (client) return (
      <>
        <p className="eyebrow"><Link href={`/${locale}/dashboard`}>{t("title")}</Link></p>
        <h1>{client.name}</h1>
        <ClientDashboard sb={sb} clientId={client.id} locale={locale} connectHref={`/${locale}/clients/${client.id}?tab=connections`}
          links={{ postsBase: `/${locale}/posts`, newPostHref: `/${locale}/posts/new?client=${client.id}`, agentHref: `/${locale}/clients/${client.id}?tab=agent`, actorClientId: client.id }} />
      </>
    );
  }

  const { data: clients } = await sb.from("clients").select("id, name").order("name").limit(24);
  const rows = await Promise.all((clients ?? []).map(async (c) => {
    const data = await loadAnalyticsData(sb, c.id);
    return { c, connected: data.accounts.length, d: dashboardFor(data), week: (await loadCadence(sb, c.id, data)).week };
  }));
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      {rows.length === 0 && <p>{t("noClients")}</p>}
      <div className="grid">
        {rows.map(({ c, connected, d, week }) => (
          <Link key={c.id} href={`/${locale}/dashboard?client=${c.id}`} className="card" style={{ textDecoration: "none" }}>
            <h2>{c.name}</h2>
            {connected === 0 ? <p className="stat-vs">{t("notConnected")}</p> : (
              <dl className="mini-stats">
                <div><dt>{t("cards.followers")}</dt><dd>{d.tiles.followers.value === null ? "—" : nf.format(d.tiles.followers.value)}</dd></div>
                <div><dt>{t("cards.engagement")}</dt><dd>{d.tiles.engagement.value === null ? "—" : pf.format(d.tiles.engagement.value)}</dd></div>
                <div><dt>{t("cards.postsPublished")}</dt><dd>{d.tiles.posts.value ?? "—"}</dd></div>
              </dl>)}
            <p className="stat-vs">{tc("weekLine", { done: week.done, goal: week.goal })}{week.streak > 0 ? ` · ${tc("streak", { count: week.streak })}` : ""}</p>
            <span className="btn small">{t("openDashboard")}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
