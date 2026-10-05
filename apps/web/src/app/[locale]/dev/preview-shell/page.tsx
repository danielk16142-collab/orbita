import { notFound } from "next/navigation";
import { fakeEnabled } from "@orbita/connectors";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";

/** Development only (CONNECTORS_FAKE=1): the app shell, to review the phone menu. */
export default async function Preview({ params }: { params: Promise<{ locale: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params;
  return (
    <div className="shell">
      <Sidebar menuLabel="Menu"
        logo={<div className="logo"><div className="logo-mark" aria-hidden>O</div><div><div className="logo-name">Orbita</div><div className="logo-sub">Marketing OS</div></div></div>}
        foot={<div className="sidebar-foot">Protected session</div>}>
        <Nav locale={locale} items={[{ href: "dashboard", label: "Home" }, { href: "posts", label: "Posts" }, { href: "agent", label: "Agent" }, { href: "clients", label: "Clients" }, { href: "settings", label: "Settings" }]} />
      </Sidebar>
      <main className="content"><p className="eyebrow">Preview</p><h1>Home</h1><div className="grid"><div className="card"><h2>Followers</h2><p className="kpi">1,284</p></div><div className="card"><h2>Reach</h2><p className="kpi">9,310</p></div></div></main>
    </div>
  );
}
