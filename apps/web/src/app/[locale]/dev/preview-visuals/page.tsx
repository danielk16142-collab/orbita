import { notFound } from "next/navigation";
import { fakeVisualsEnabled } from "@orbita/visuals";
import { VisualsCard } from "@/components/visuals/visuals-card";
import { VisualPanel, type VisualJob } from "@/components/visuals/visual-panel";
import { PostKit } from "@/components/visuals/post-kit";
import { MediaPanel } from "@/components/visuals/media-panel";
import { StrategyChat } from "@/components/strategy/strategy-chat";
import { PostReview } from "@/components/posts/post-review";
import { WinsList, type WinRow } from "@/components/competitors/wins-list";
import { AddWinForm } from "@/components/competitors/wins";

const svg = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="${["#ff4e1b", "#0a0a0a", "#e8dcc4"][n % 3]}"/><text x="90" y="640" font-family="Arial" font-weight="800" font-size="120" fill="${n % 3 === 2 ? "#0a0a0a" : "#fff"}">Slide ${n}</text></svg>`)}`;
const img = (n: number) => ({ page: n, width: 1080, height: 1350, url: svg(n) });

/** Development only (VISUALS_FAKE=1): the visual creation screens in each state, for review. */
const brand = { name: "Café Luna", language: "en" as const, primary: "#0a7d5a", accent: "#ff4e1b", palette: [{ name: "Sand", hex: "#e8dcc4", role: "background" }, { name: "Espresso", hex: "#2b1d14", role: "text" }], headingFont: "Bricolage Grotesque", bodyFont: "Inter" };
const reel = { duration_seconds: 30, hook_options: ["Stop pouring hot espresso on ice"], scenes: [{ seconds: "0-3s", visual: "Barista pours espresso over ice, macro shot", voiceover: "Stop doing this.", on_screen_text: "Mistake 1" }, { seconds: "3-9s", visual: "Cold brew dripping slowly into a glass", voiceover: "Try this instead.", on_screen_text: "" }], cta: "Follow for more café secrets", audio_note: "Upbeat lo-fi" };
const carousel = { slides: [{ title: "3 iced coffee mistakes", body: "And how to fix them", visual: "close-up of iced coffee in warm light" }, { title: "Mistake 1", body: "Hot espresso on ice waters it down", visual: "espresso pouring over ice" }], cta: "Save this for your next brew" };
const refs = [{ kind: "style", caption: "warm morning light, wood and ceramic", url: svg(1) }, { kind: "product", caption: "our glass cold brew bottle", url: svg(2) }, { kind: "avoid", caption: "stock-photo smiles", url: svg(3) }];

export default async function Preview({ searchParams }: { searchParams: Promise<{ state?: string; view?: string; type?: string }> }) {
  if (!fakeVisualsEnabled()) notFound();
  const q = await searchParams;
  if (q.view === "strategy-chat") return (<main className="content"><p className="eyebrow">Preview (fake data)</p><h1>Strategy</h1><StrategyChat locale="en" hasStrategy={q.type !== "new"} /></main>);
  if (q.view === "wins") {
    const w = (id: string, hook: string, views: number | null, likes: number | null, comp = "a"): WinRow => ({ id, competitor_id: comp, hook, url: "https://www.instagram.com/reel/abc/", network: "instagram", views, likes, comments: 120, shares: null, followers: null, posted_at: "2026-09-14", formula_id: null });
    const rows = [w("1", "$18,000 is what one missing clause cost me.", 200000, 9000), w("2", "Meh update from the team", 10000, 300), w("3", "Another post about coffee", 12000, 400), w("4", "Third post", 8000, 200), w("5", "Nobody tells you cold brew takes 20 hours", 95000, 4000, "b")];
    return (
      <main className="content"><p className="eyebrow">Preview (fake data)</p><h1>What's working</h1>
        <WinsList rows={rows} names={{ a: "Rival Café", b: "Bean There" }} staff winChat={(idea) => `/en/agent?ask=winner&idea=${encodeURIComponent(idea)}`} />
        <AddWinForm competitorId="00000000-0000-0000-0000-000000000000" />
      </main>
    );
  }
  if (q.view === "review") {
    const lang = q.type === "es" ? "es" : "en";
    const rc = { duration_seconds: 20, hook_options: ["Proposals used to take me five hours. Twenty minutes now.", "Hey guys, today I want to talk about proposals."], scenes: [{ seconds: "0-3", visual: "Desk", voiceover: "I built one template — it changed everything.", on_screen_text: "5 HOURS TO 20 MIN" }, { seconds: "3-20", visual: "Screen", voiceover: "Steal it. Comment TEMPLATE and I will send it. Five hours, twenty minutes.", on_screen_text: "" }], cta: "Comment TEMPLATE", audio_note: "" };
    return (
      <main className="content"><p className="eyebrow">Preview (fake data)</p><h1>Quality check</h1>
        <PostReview postId="00000000-0000-0000-0000-000000000000" post={{ type: "reel", language: lang, caption: "It’s a game-changer — five hours down to twenty minutes. We leverage a seamless template.\n\nComment TEMPLATE. Save this for later. #viral #fyp #proposals", hashtags: ["proposals"], content: rc }} />
      </main>
    );
  }
  if (q.view === "kit") {
    const type = q.type === "carousel" ? "carousel" : "reel";
    return (
      <main className="content"><p className="eyebrow">Preview (fake data)</p><h1>Create outside</h1>
        <PostKit postId="00000000-0000-0000-0000-000000000000" post={{ type, content: type === "carousel" ? carousel : reel }} brand={brand} refs={refs} />
        <MediaPanel postId="00000000-0000-0000-0000-000000000000" canEdit items={[{ id: "1", kind: "image", name: "cover.png", url: svg(1), width: 1080, height: 1350 }, { id: "3", kind: "image", name: "slide-2.png", url: svg(2), width: 1080, height: 1350 }]} />
      </main>
    );
  }
  const state = q.state ?? "all";
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
