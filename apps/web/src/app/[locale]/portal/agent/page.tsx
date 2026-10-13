import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { AgentWorkspace, agentViewOf } from "@/components/agent/agent-workspace";

export default async function PortalAgent({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string; ask?: string; format?: string; network?: string; idea?: string; thread?: string }> }) {
  const { locale } = await params;
  const q = await searchParams;
  const t = await getTranslations("agent");
  await requireClientUser(locale);
  const base = `/${locale}/portal/agent`;
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1>
      <AgentWorkspace locale={locale as "en" | "fr" | "es"} view={agentViewOf(q.view)} query={q}
        hrefFor={(v, extra) => `${base}?${new URLSearchParams({ view: v, ...extra })}`} profileHref={`/${locale}/portal/profile`} />
    </>
  );
}
