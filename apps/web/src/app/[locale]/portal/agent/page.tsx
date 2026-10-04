import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { AgentPanel } from "@/components/agent/agent-panel";

export default async function PortalAgent({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("agent");
  await requireClientUser(locale);
  return (<><p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><AgentPanel locale={locale as "en" | "fr" | "es"} /></>);
}
