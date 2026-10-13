import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { CompetitorsPanel } from "@/components/competitors/competitors-panel";

export default async function PortalCompetitors({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("competitors");
  await requireClientUser(locale);
  return (<><p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><CompetitorsPanel locale={locale} detailBase={`/${locale}/portal/competitors`} /></>);
}
