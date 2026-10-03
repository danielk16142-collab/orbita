import { getTranslations } from "next-intl/server";
import { Nav } from "@/components/nav";

export default async function AgencyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark" aria-hidden>O</div>
          <div><div className="logo-name">Orbita</div><div className="logo-sub">{t("tagline")}</div></div>
        </div>
        <Nav locale={locale} items={[
          { href: "dashboard", label: t("home") },
          { href: "posts", label: t("posts") },
          { href: "agent", label: t("agent") },
          { href: "clients", label: t("clients") },
          { href: "settings", label: t("settings") },
        ]} />
        <div className="sidebar-foot">{t("secure")}</div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
