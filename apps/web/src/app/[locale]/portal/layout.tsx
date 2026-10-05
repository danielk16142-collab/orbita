import { getTranslations } from "next-intl/server";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { requireClientUser } from "@/lib/session";
import { themeVars } from "@/lib/theme";

/** Client portal: same shell and Orbita logo, with the business name and the client's own colors. */
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("portal");
  const tn = await getTranslations("nav");
  const { sb, profile } = await requireClientUser(locale);
  const { data: client } = await sb.from("clients").select("name, primary_color, accent_color").eq("id", profile.client_id).single();
  const vars = themeVars({ primary: client?.primary_color, accent: client?.accent_color }) as React.CSSProperties;
  return (
    <div className="shell" style={vars}>
      <Sidebar menuLabel={tn("menu")}
        logo={<div className="logo brand portal-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/brand/orbita-logo-light.svg" alt="Orbita" width={716} height={203} />
          <div className="portal-client"><span className="portal-name">{client?.name}</span><small>{t("tagline")}</small></div>
        </div>}>
        <Nav locale={locale} items={[
          { href: "portal", label: t("home") },
          { href: "portal/posts", label: t("posts") },
          { href: "portal/agent", label: t("agent") },
          { href: "portal/settings", label: t("settings") },
        ]} />
      </Sidebar>
      <main className="content">{children}</main>
    </div>
  );
}
