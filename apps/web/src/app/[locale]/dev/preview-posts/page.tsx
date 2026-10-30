import { notFound } from "next/navigation";
import { fakeEnabled } from "@orbita/connectors";
import { CalendarView } from "@/components/posts/calendar-view";
import type { CalPost } from "@/components/posts/shared";
import { PostList, type ListPost } from "@/components/posts/post-list";

/** Development only (CONNECTORS_FAKE=1): the calendar rendered from sample posts. */
export default async function Preview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params; const view = ((await searchParams).view ?? "month") as "month" | "week" | "day" | "list";
  const today = new Date().toISOString().slice(0, 10), ym = today.slice(0, 8);
  const mk = (d: number, network: string, type: string, status: string, idea: string, time: string | null = "09:00"): CalPost => ({ id: `${d}${network}${idea.length}`, client_id: "c", network, type, status, planned_date: `${ym}${String(d).padStart(2, "0")}`, suggested_time: time, idea, caption: "Caption text for the day view preview.", clients: { name: "Café Luna" } });
  const posts = [mk(3, "instagram", "reel", "published", "Behind the espresso machine"), mk(5, "tiktok", "reel", "approved", "3 mistakes making iced coffee"), mk(5, "instagram", "carousel", "draft", "Menu of the week", "12:30"), mk(5, "instagram", "static", "idea", "Friday promo", null), mk(5, "tiktok", "reel", "idea", "Staff pick"), mk(5, "instagram", "static", "scheduled", "Fifth one"), mk(12, "instagram", "static", "scheduled", "Weekend brunch announcement"), mk(18, "tiktok", "reel", "idea", "Day in the life of a barista")];
  if (view === "list") {
    const cover = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#e8dcc4"/><text x="60" y="520" font-family="Arial" font-weight="800" font-size="90" fill="#2b1d14">Cold brew</text></svg>')}`;
    const reel = { duration_seconds: 28, hook_options: ["Stop pouring hot espresso over ice"], scenes: [{ seconds: "0-3", visual: "v", voiceover: "Stop.", on_screen_text: "x" }, { seconds: "3-9", visual: "v", voiceover: "Try this.", on_screen_text: "" }], cta: "Follow", audio_note: "" };
    const car = { slides: [{ title: "3 iced coffee mistakes", body: "b", visual: "" }, { title: "Mistake 1", body: "b", visual: "" }, { title: "Mistake 2", body: "b", visual: "" }], cta: "Save this" };
    const lp: ListPost[] = [
      { ...posts[1], caption: "Hot espresso on ice waters it down. Here is the fix we use every morning at the bar, and why it tastes better.", content: reel, hashtags: ["coldbrew", "cafe"], hasVideo: true },
      { ...posts[2], caption: "Five things on the menu this week that you should not miss.", content: car, hashtags: [], thumb: cover },
      { ...posts[3], caption: null, content: null, hashtags: [] },
      { ...posts[0], caption: "Behind the machine: how we pull a shot.", content: null, hashtags: ["barista"] },
      { ...posts[6], caption: "Weekend brunch is back with a new menu.", content: { headline: "Brunch is back", visual_brief: "x", cta: "Book" }, hashtags: [] },
    ];
    return (<main className="content"><h1>Posts</h1><PostList locale={locale} posts={lp} today={today} showClient postHref={() => "#"} /></main>);
  }
  return (<main className="content"><h1>Posts</h1><CalendarView locale={locale} view={view} anchor={`${ym}05`} posts={posts} today={today} showClient postHref={() => "#"} dayHref={(d) => `#${d}`} /></main>);
}
