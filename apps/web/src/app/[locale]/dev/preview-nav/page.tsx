import { notFound } from "next/navigation";
import { AgencyNav } from "@/components/agency-nav";
import { Sidebar } from "@/components/sidebar";
import { fakeEnabled } from "@orbita/connectors";

const CLIENTS = [{ id: "11111111-1111-4111-8111-111111111111", name: "Plastik Tour" }, { id: "22222222-2222-4222-8222-222222222222", name: "Recovery House Medellín" }, { id: "33333333-3333-4333-8333-333333333333", name: "Dany Designs" }];

/** Development only (CONNECTORS_FAKE=1): the agency sidebar as it looks on a given page. ?at=/en/clients/<id>?tab=strategy */
export default async function Preview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ at?: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params;
  const { at = `/${locale}/dashboard` } = await searchParams;
  return (
    <div className="shell">
      <Sidebar menuLabel="Menu" logo={<div className="logo brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="brand-logo" src="/brand/orbita-logo-light.svg" alt="Orbita" width={716} height={203} /></div>} foot={<div className="sidebar-foot">Protected session</div>}>
        <AgencyNav locale={locale} clients={CLIENTS} at={at} />
      </Sidebar>
      <main className="content"><h1>Preview</h1><p>{at}</p></main>
    </div>
  );
}
