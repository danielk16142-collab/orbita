import { getTranslations } from "next-intl/server";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { requireClientUser } from "@/lib/session";
import { themeVars } from "@/lib/theme";

/** Client portal: same shell, themed with the client's own logo and colors. */
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("portal");
  const tn = await getTranslations("nav");
  const { sb, profile } = await requireClientUser(locale);
  const { data: client } = await sb.from("clients").select("name, primary_color, accent_color, logo_dark_path").eq("id", profile.client_id).single();
  // The sidebar is dark, so it uses the logo variant made for dark backgrounds.
  const logo = client?.logo_dark_path ? (await sb.storage.from("client-logos").createSignedUrl(client.logo_dark_path, 3600)).data?.signedUrl : null;
  const vars = themeVars({ primary: client?.primary_color, accent: client?.accent_color }) as React.CSSProperties;
  return (
    <div className="shell" style={vars}>
      <Sidebar menuLabel={tn("menu")}
        logo={<div className="logo">
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt={client?.name ?? ""} style={{ maxWidth: 180, maxHeight: 48 }} />
            : <><div className="logo-mark" aria-hidden>{(client?.name ?? "O").slice(0, 1).toUpperCase()}</div><div><div className="logo-name">{client?.name}</div><div className="logo-sub">{t("tagline")}</div></div></>}
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
