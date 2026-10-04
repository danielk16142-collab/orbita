import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";

export default async function PortalHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("portal");
  const { sb, profile } = await requireClientUser(locale);
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <ClientDashboard sb={sb} clientId={profile.client_id} locale={locale} connectHref={`/${locale}/portal/settings`} />
    </>
  );
}
