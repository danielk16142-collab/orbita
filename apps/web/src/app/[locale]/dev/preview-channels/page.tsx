import { notFound } from "next/navigation";
import { fakeEnabled } from "@orbita/connectors";
import { summarizeTikTok } from "@orbita/agent";
import { ChannelsView } from "@/components/dashboard/channel-cards";

/** Development only (CONNECTORS_FAKE=1): the TikTok and LinkedIn cards with sample numbers. ?empty=1 for the first visit. */
export default async function Preview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ empty?: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params; const q = await searchParams;
  const now = new Date();
  const d = (n: number) => new Date(now.getTime() - n * 864e5).toISOString().slice(0, 10);
  const v = (n: number, views: number, hook: string) => ({ url: "https://www.tiktok.com/@danydesigns/video/1", hook, views, likes: Math.round(views / 12), comments: 8, shares: 3, followers: 1240, postedAt: d(n) });
  const tk = summarizeTikTok([v(1, 900, "I tested a lead at 9pm"), v(5, 14200, "Claude can now run your Instagram"), v(12, 420, "Website tip #4"), v(20, 2600, "Before and after: Café Luna")], now, 1190);
  const li = { period: { from: d(90), to: d(1) }, impressions: 18400, membersReached: 6900, engagements: 410, engagementRate: 0.0223, followers: 812, newFollowers: 64, weeks: [],
    topPosts: [{ url: "https://www.linkedin.com/feed/update/urn:li:activity:1", date: d(12), engagements: 88, impressions: 5200 }, { url: "https://www.linkedin.com/feed/update/urn:li:activity:2", date: d(30), engagements: 40, impressions: 2100 }],
    demographics: [{ category: "Job titles", value: "Founder", share: 0.14 }, { category: "Locations", value: "Montreal", share: 0.31 }], found: ["engagement"] };
  const audit = { verdict: "Views are up, but posting once a week caps growth: the one video that opened on a result did 15x the others.", working: ["Videos that open on a result (14.2K views)", "Short tool demos keep people watching"], not_working: ["0.9 videos a week", "Tips with a generic opening line stay under 500 views"],
    recommendations: [{ title: "Post 3 times a week", why: "4 videos in 30 days; the account grows when it posts", how: "Batch 3 short demos on Monday; reuse the same videos on Instagram." }, { title: "Open on the result", why: "The top video opened on what happened; the weakest on a topic", how: "Rewrite each hook as the outcome in under 8 words." }], this_week: ["Film 3 demos", "Reply to every comment in the first hour"] };
  const row = (network: "tiktok" | "linkedin", summary: unknown, a: unknown) => ({ id: `00000000-0000-0000-0000-00000000000${network === "tiktok" ? 1 : 2}`, network, source: "x", handle: network === "tiktok" ? "danydesigns" : null, summary, audit: a, audited_at: a ? now.toISOString() : null, created_at: now.toISOString() });
  return (
    <main className="content"><p className="eyebrow">Preview (sample data)</p><h1>Dany Designs</h1>
      <ChannelsView locale={locale} staff profileHref="#" apify setUp handle={q.empty ? null : "danydesigns"}
        tiktok={q.empty ? null : row("tiktok", tk, audit)} linkedin={q.empty ? null : row("linkedin", li, null)} />
    </main>
  );
}
