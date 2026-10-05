import { getTranslations } from "next-intl/server";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { requireStaff } from "@/lib/session";

export default async function AgencyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  await requireStaff(locale); // sign-in + terms + MFA (AAL2) + role, for every staff page
  return (
    <div className="shell">
      <Sidebar menuLabel={t("menu")}
        logo={<div className="logo">
          <div className="logo-mark" aria-hidden>O</div>
          <div><div className="logo-name">Orbita</div><div className="logo-sub">{t("tagline")}</div></div>
        </div>}
        foot={<div className="sidebar-foot">{t("secure")}</div>}>
        <Nav locale={locale} items={[
          { href: "dashboard", label: t("home") },
          { href: "posts", label: t("posts") },
          { href: "agent", label: t("agent") },
          { href: "clients", label: t("clients") },
          { href: "settings", label: t("settings") },
        ]} />
      </Sidebar>
      <main className="content">{children}</main>
    </div>
  );
}
