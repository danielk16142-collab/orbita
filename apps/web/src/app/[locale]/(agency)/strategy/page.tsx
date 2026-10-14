import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { ClientSwitcher } from "@/components/client-switcher";
import { StrategyPanel } from "@/components/strategy/strategy-panel";

/** Agency view: one client's strategy (mind map and calendar map), with a switcher to change client. */
export default async function StrategyIndex({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ client?: string; month?: string; layout?: string }> }) {
  const { locale } = await params;
  const q = await searchParams;
  const t = await getTranslations("strategyPage");
  const tcl = await getTranslations("clients");
  const { sb } = await requireStaff(locale);
  const { data: clients } = await sb.from("clients").select("id, name").order("name");
  const current = (clients ?? []).find((c) => c.id === q.client) ?? clients?.[0];
  const base = `/${locale}/strategy`;
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <div className="page-head">
        <h1>{t("title")}</h1>
        {current && <ClientSwitcher action={base} clients={clients ?? []} current={current.id} label={tcl("client")} button={tcl("open")} keep={q.layout ? { layout: q.layout } : {}} />}
      </div>
      {current ? (
        <StrategyPanel locale={locale} clientId={current.id} query={q} hrefFor={(extra) => `${base}?${new URLSearchParams({ client: current.id, ...extra })}`}
          agentAskHref={`/${locale}/agent?${new URLSearchParams({ client: current.id, view: "chat", ask: "strategy" })}`} profileHref={`/${locale}/clients/${current.id}?tab=profile`} />
      ) : <p>{tcl("empty")}</p>}
    </>
  );
}
