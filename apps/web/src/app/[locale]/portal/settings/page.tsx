import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { BrandingPanel } from "@/components/branding-panel";

export default async function PortalSettings({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { locale } = await params;
  const q = await searchParams;
  const t = await getTranslations("settings");
  const { sb, profile } = await requireClientUser(locale);
  const { data: client } = await sb.from("clients").select("*").eq("id", profile.client_id).single();
  const sign = async (p: string | null) => p ? (await sb.storage.from("client-logos").createSignedUrl(p, 3600)).data?.signedUrl ?? null : null;
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      {client && <BrandingPanel locale={locale} client={client} canEdit={!client.branding_locked}
        logos={{ light: await sign(client.logo_light_path), dark: await sign(client.logo_dark_path) }} saved={q.saved === "1"} error={q.error} />}
      <div className="grid">
        <section className="card"><h2>{t("security")}</h2><p>{t("securityText")}</p><Link className="btn" href={`/${locale}/security/mfa`}>{t("manageMfa")}</Link></section>
        <section className="card"><h2>{t("privacy")}</h2><p>{t("privacyText")}</p><Link className="btn" href={`/${locale}/portal/settings/privacy`}>{t("open")}</Link></section>
      </div>
    </>
  );
}
