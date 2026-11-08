import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AgencyNav } from "@/components/agency-nav";
import { Sidebar } from "@/components/sidebar";
import { requireStaff } from "@/lib/session";

export default async function AgencyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  const { sb } = await requireStaff(locale); // sign-in + terms + MFA (AAL2) + role, for every staff page
  const { data: clients } = await sb.from("clients").select("id, name").order("name"); // for the client menu in the sidebar
  return (
    <div className="shell">
      <Sidebar menuLabel={t("menu")}
        logo={<div className="logo brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/brand/orbita-logo-light.svg" alt="Orbita" width={716} height={203} />
        </div>}
        foot={<div className="sidebar-foot">{t("secure")}</div>}>
        <Suspense fallback={null}><AgencyNav locale={locale} clients={clients ?? []} /></Suspense>
      </Sidebar>
      <main className="content">{children}</main>
    </div>
  );
}
