import { notFound } from "next/navigation";
import { fakeEnabled } from "@orbita/connectors";
import { StrategyMap } from "@/components/strategy/strategy-map";
import { StrategyMindMap } from "@/components/strategy/strategy-mind-map";
import type { StrategyMapData } from "@/lib/strategy-map";
import type { MapPost } from "@orbita/agent";

/** Development only (CONNECTORS_FAKE=1): the Strategy views with sample data. ?layout=calendar for the grid; ?loose=1 before connecting. */
export default async function Preview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ layout?: string; loose?: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params; const q = await searchParams;
  const month = new Date().toISOString().slice(0, 7);
  const d = (n: number) => `${month}-${String(n).padStart(2, "0")}`;
  const plan = (id: string, n: number, format: string, pillar: string | null, title: string, status = "idea"): MapPost => ({ id, kind: "plan", title, format, network: "instagram", status, date: d(n), pillar });
  const live = (id: string, n: number, format: string, pillar: string, title: string, rate: number, views: number): MapPost => ({ id, kind: "live", title, format, network: "instagram", status: "published", date: d(n), pillar, rate, views, permalink: "https://www.instagram.com/", metrics: { likes: Math.round(views * rate * 0.7), comments: 4, saves: 9 }, caption: `${title}\n\nFull caption text of the published post.` });
  const posts: MapPost[] = [
    live("a", 2, "reel", "Proof", "Before & After: Café Luna homepage", 0.062, 4200), live("b", 5, "carousel", "Education", "3 signs your website is losing clients", 0.041, 1900),
    live("c", 8, "static", "Proof", "Recovery House: +85% sessions in 30 days", 0.055, 2300), live("d", 10, "story", "Behind the scenes", "Studio day", 0.02, 600),
    plan("e", 15, "reel", "Proof", "Before & After Fridays: Plastik Tour", "approved"), plan("f", 17, "carousel", "Education", "What a homepage must say in 5 seconds", "draft"),
    plan("g", 21, "static", "Offers", "Website audit: 5 spots this month"), plan("h", 24, "reel", null, "Day in the life of a web designer"),
  ];
  const data: StrategyMapData = {
    month, today: d(13), hasLive: true, goal: 3, posts,
    business: { name: "Dany Designs", business: "Web design and digital marketing studio in Montreal for small businesses.", offers: "Websites from $975, eCommerce, AI solutions.", personas: ["Café and restaurant owners", "Real estate agents", "Wellness clinics"] },
    kpis: { followers: 1240, followersDelta: 38, reach: 18400, reachDelta: 0.22, engagement: 0.046, published30: 4 },
    strategy: { title: "Q4 strategy", period: "quarter", createdAt: `${month}-01T00:00:00Z`, content: {
      objectives: ["Get 10 qualified leads a month", "Grow Instagram to 1,500 followers", "Be known as the Montreal studio that shows results"],
      pillars: [{ name: "Proof", angle: "Real results and before/after work", share_percent: 40 }, { name: "Education", angle: "Teach what makes a website sell", share_percent: 30 }, { name: "Behind the scenes", angle: "The studio and the process", share_percent: 20 }, { name: "Offers", angle: "Clear offers with a deadline", share_percent: 10 }],
      series: [{ name: "Before & After Fridays", subject: "One redesign a week, side by side", formats: ["reel"], networks: ["instagram"] }, { name: "Website ER", subject: "Quick fixes for a real site", formats: ["carousel"], networks: ["instagram"] }],
      cadence: [{ network: "instagram", posts_per_week: 3, best_days: ["tue", "thu", "sun"], best_time: "18:30", why: "" }],
      topics: ["3 signs your website is losing clients", "What a homepage must say in 5 seconds", "Why your café needs online booking", "Photos that sell a listing"],
      rationale: "Proof converts best for this audience: show results first, then teach, then offer.",
      links: q.loose ? undefined : {
        pillar_goals: { Proof: [0, 2], Education: [1, 2], "Behind the scenes": [1], Offers: [0] },
        pillar_personas: { Proof: [0, 1], Education: [0, 1], "Behind the scenes": [], Offers: [0] },
        persona_pains: { "0": ["My website doesn't bring customers", "I have no time for social media"], "1": ["Listings look the same as everyone's"] },
        series_pillar: { "Before & After Fridays": "Proof", "Website ER": "Education" },
      },
    } },
  };
  return (
    <main className="content"><p className="eyebrow">Preview (sample data)</p><h1>Strategy</h1>
      {q.layout === "calendar"
        ? <StrategyMap data={data} locale={locale} postsBase="#" newPostHref="#" prevMonthHref="#" nextMonthHref="#" askStrategyHref="#" />
        : <StrategyMindMap data={data} locale={locale} postsBase="#" newPostHref="#" />}
    </main>
  );
}
