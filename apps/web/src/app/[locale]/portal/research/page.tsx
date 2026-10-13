import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { ResearchPanel } from "@/components/research/research-panel";

export default async function PortalResearch({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("research");
  await requireClientUser(locale);
  return (<><p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><ResearchPanel locale={locale} /></>);
}
