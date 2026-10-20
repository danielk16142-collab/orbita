import { notFound } from "next/navigation";
import { fakeVisualsEnabled } from "@orbita/visuals";
import { VisualsCard } from "@/components/visuals/visuals-card";
import { VisualPanel, type VisualJob } from "@/components/visuals/visual-panel";

const svg = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="${["#ff4e1b", "#0a0a0a", "#e8dcc4"][n % 3]}"/><text x="90" y="640" font-family="Arial" font-weight="800" font-size="120" fill="${n % 3 === 2 ? "#0a0a0a" : "#fff"}">Slide ${n}</text></svg>`)}`;
const img = (n: number) => ({ page: n, width: 1080, height: 1350, url: svg(n) });

/** Development only (VISUALS_FAKE=1): the visual creation screens in each state, for review. */
export default async function Preview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!fakeVisualsEnabled()) notFound();
  const state = (await searchParams).state ?? "all";
  const job = (s: Partial<VisualJob>): VisualJob => ({ id: "00000000-0000-0000-0000-000000000000", status: "succeeded", pages: 3, errorCode: null, images: [], ...s });
  const panels: { label: string; job: VisualJob | null; canCreate: boolean }[] = [
    { label: "No visual yet (staff)", job: null, canCreate: true },
    { label: "Done (staff)", job: job({ images: [img(1), img(2), img(3)] }), canCreate: true },
    { label: "Failed (staff)", job: job({ status: "failed", errorCode: "insufficient_credits" }), canCreate: true },
    { label: "Done (client portal)", job: job({ images: [img(1), img(2)] , pages: 2}), canCreate: false },
  ];
  return (
    <main className="content">
      <p className="eyebrow">Preview (fake provider)</p><h1>Visuals</h1>
      <VisualsCard clientId="00000000-0000-0000-0000-000000000000" enabled monthlyCap={20} brandKitId={null} used={7} configured={false} canEdit />
      {panels.filter((_, i) => state === "all" || String(i) === state).map((p) => (
        <div key={p.label}><p className="eyebrow" style={{ marginTop: "1.5rem" }}>{p.label}</p><VisualPanel postId="00000000-0000-0000-0000-000000000000" canCreate={p.canCreate} initial={p.job} used={7} cap={20} /></div>
      ))}
    </main>
  );
}
