import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { AgentWorkspace, agentViewOf } from "@/components/agent/agent-workspace";
import { ClientSwitcher } from "@/components/client-switcher";

/** Agency view: the agent of one client (chat, strategy and research, audit), with a switcher to change client. */
export default async function AgentIndex({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ client?: string; view?: string; ask?: string; format?: string; network?: string; idea?: string; thread?: string }> }) {
  const { locale } = await params;
  const q = await searchParams;
  const t = await getTranslations("agent");
  const tcl = await getTranslations("clients");
  const { sb } = await requireStaff(locale);
  const { data: clients } = await sb.from("clients").select("id, name").order("name");
  const current = (clients ?? []).find((c) => c.id === q.client) ?? clients?.[0];
  const base = `/${locale}/agent`;
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <div className="page-head">
        <h1>{t("title")}</h1>
        {current && <ClientSwitcher action={base} clients={clients ?? []} current={current.id} label={tcl("client")} button={tcl("open")} keep={{ view: agentViewOf(q.view) }} />}
      </div>
      {current ? (
        <AgentWorkspace locale={locale as "en" | "fr" | "es"} clientId={current.id} view={agentViewOf(q.view)} query={q}
          hrefFor={(v, extra) => `${base}?${new URLSearchParams({ client: current.id, view: v, ...extra })}`} profileHref={`/${locale}/clients/${current.id}?tab=profile`} />
      ) : <p>{tcl("empty")}</p>}
    </>
  );
}
