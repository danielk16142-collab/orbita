import { notFound } from "next/navigation";
import { fakeEnabled } from "@orbita/connectors";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";

/** Development only (CONNECTORS_FAKE=1): the app shell, to review the phone menu. */
export default async function Preview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ portal?: string; name?: string; color?: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params;
  const q = await searchParams;
  const portal = q.portal === "1";
  return (
    <div className="shell" style={q.color ? ({ "--brand": q.color } as React.CSSProperties) : undefined}>
      <Sidebar menuLabel="Menu"
        logo={<div className={`logo brand${portal ? " portal-head" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/brand/orbita-logo-light.svg" alt="Orbita" width={716} height={203} />
          {portal && <div className="portal-client"><span className="portal-name">{q.name ?? "Café Luna"}</span><small>Your dashboard</small></div>}
        </div>}
        foot={<div className="sidebar-foot">Protected session</div>}>
        <Nav locale={locale} items={[{ href: "dashboard", label: "Home" }, { href: "posts", label: "Posts" }, { href: "agent", label: "Agent" }, { href: "clients", label: "Clients" }, { href: "settings", label: "Settings" }]} />
      </Sidebar>
      <main className="content"><p className="eyebrow">Preview</p><h1>Home</h1><div className="grid"><div className="card"><h2>Followers</h2><p className="kpi">1,284</p></div><div className="card"><h2>Reach</h2><p className="kpi">9,310</p></div></div></main>
    </div>
  );
}
