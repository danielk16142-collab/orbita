import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { ProfilePanel } from "@/components/profile/profile-panel";

/** The business's own profile: details, links, and what the agent knows. Client users can add links and review suggestions. */
export default async function PortalProfile({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("profile");
  const { sb, profile } = await requireClientUser(locale);
  const { data: client } = await sb.from("clients").select("id, name, languages, markets, timezone").eq("id", profile.client_id).single();
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1>
      {client && <ProfilePanel locale={locale} client={client} staff={false} learnedHref={`/${locale}/portal/profile/learned`} strategyHref={`/${locale}/portal/strategy`} />}
    </>
  );
}
