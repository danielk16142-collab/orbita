import { notFound } from "next/navigation";
import { fakeEnabled } from "@orbita/connectors";
import { CalendarView } from "@/components/posts/calendar-view";
import type { CalPost } from "@/components/posts/shared";

/** Development only (CONNECTORS_FAKE=1): the calendar rendered from sample posts. */
export default async function Preview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params; const view = ((await searchParams).view ?? "month") as "month" | "week" | "day";
  const today = new Date().toISOString().slice(0, 10), ym = today.slice(0, 8);
  const mk = (d: number, network: string, type: string, status: string, idea: string, time: string | null = "09:00"): CalPost => ({ id: `${d}${network}${idea.length}`, client_id: "c", network, type, status, planned_date: `${ym}${String(d).padStart(2, "0")}`, suggested_time: time, idea, caption: "Caption text for the day view preview.", clients: { name: "Café Luna" } });
  const posts = [mk(3, "instagram", "reel", "published", "Behind the espresso machine"), mk(5, "tiktok", "reel", "approved", "3 mistakes making iced coffee"), mk(5, "instagram", "carousel", "draft", "Menu of the week", "12:30"), mk(5, "instagram", "static", "idea", "Friday promo", null), mk(5, "tiktok", "reel", "idea", "Staff pick"), mk(5, "instagram", "static", "scheduled", "Fifth one"), mk(12, "instagram", "static", "scheduled", "Weekend brunch announcement"), mk(18, "tiktok", "reel", "idea", "Day in the life of a barista")];
  return (<main className="content"><h1>Posts</h1><CalendarView locale={locale} view={view} anchor={`${ym}05`} posts={posts} today={today} showClient postHref={() => "#"} dayHref={(d) => `#${d}`} /></main>);
}
