import { notFound } from "next/navigation";
import { fakeConnector, fakeEnabled } from "@orbita/connectors";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { Tabs } from "@/components/tabs";
import { ProfileView } from "@/components/profile/profile-panel";
import { MemoriesView } from "@/components/profile/memories";
import { AuditView, ContentSuggestions, ProfileNudge, StrategyView } from "@/components/agent/agent-views";
import { ResearchView } from "@/components/research/research-panel";
import { CompetitorsView, CompetitorDetailView } from "@/components/competitors/competitors-panel";
import { AgentChat } from "@/components/agent/agent-chat";
import { InsightsView } from "@/components/insights/insights-panel";
import { BrandingPanel } from "@/components/branding-panel";
import { CreatePostFlow } from "@/components/posts/create-post-flow";
import type { AnalyticsData } from "@/lib/analytics/load";

/** Development only (CONNECTORS_FAKE=1): the client screens with sample data, to review layout without a database. */
export default async function Preview({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; view?: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params;
  const q = await searchParams;
  const tab = q.tab ?? "profile", view = q.view ?? "chat";
  const href = (t: string, v?: string) => `?tab=${t}${v ? `&view=${v}` : ""}`;
  const now = new Date();
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
  const sources = [{ id: "s1", kind: "website" as const, url: "https://cafeluna.example.com", handle: null }, { id: "s2", kind: "instagram" as const, url: null, handle: "cafeluna" }, { id: "s3", kind: "tiktok" as const, url: null, handle: "cafeluna.mtl" }];
  const audit = { summary: "A warm neighbourhood café with a clear voice on Instagram, but the website does not show the menu or opening hours, and TikTok posting is irregular.", strengths: ["Consistent warm photography", "Friendly, local tone"], weaknesses: ["Menu and hours missing on the website", "TikTok posts are irregular"], opportunities: ["Short reels showing drinks being made", "Weekly brunch announcement series"], social_notes: "Instagram is the main channel; TikTok has potential with behind the scenes clips.", missing_info: ["Price range", "Who the main customers are"], createdAt: day(6) };
  const strategy = { title: "Autumn plan", period: "quarter", createdAt: day(10), content: { objectives: ["More weekend brunch bookings", "Grow Instagram followers in the neighbourhood"], pillars: [{ name: "Behind the counter", share_percent: 40 }, { name: "Menu and seasonal drinks", share_percent: 35 }, { name: "Community", share_percent: 25 }], cadence: [{ network: "instagram", posts_per_week: 4, best_days: ["tue", "thu", "sat"], best_time: "09:00" }, { network: "tiktok", posts_per_week: 3, best_days: ["wed", "fri"], best_time: "18:00" }], topics: ["Pumpkin spice, made right", "Meet the barista", "Brunch menu reveal"] } };
  const research = [{ id: "r1", kind: "trend", title: "Slow pour videos are getting saved", summary: "Short close ups of latte art and pour overs are among the most saved café posts this month.", sources: [{ title: "Example source", url: "https://example.com" }], createdAt: day(3) }];
  const briefRow = { brand: "Café Luna is a neighbourhood café in Montreal serving specialty coffee and weekend brunch.", voice: "Warm, simple, a little playful.", avoid: ["Corporate language"], personas: ["Young professionals nearby", "Weekend brunch groups"], content_pillars: ["Behind the counter", "Menu", "Community"] };
  const mem: [string, string][] = [["preference", "Always mention the oat milk option"], ["avoid", "No emojis in captions"], ["fact", "Open every day from 7:00 to 16:00, brunch on weekends until 15:00"],
    ["rule", "Every post about a promotion must say when it ends"], ["preference", "Photos with natural light, never flash, and the wood counter in the background whenever possible so the place feels warm and familiar"],
    ["fact", "Roasts its own beans in small batches"], ["example", "The pumpkin spice reel with the slow pour got the most saves this autumn"], ["avoid", "Do not compare with the chain café across the street"],
    ["preference", "Captions short, two lines at most"], ["fact", "Most customers are young professionals working nearby"]];
  const memories = mem.map(([kind, content], i) => ({ id: `m${i}`, kind: kind as "preference", content, weight: 1, createdAt: day(i + 1) }));
  const proposals = [{ id: "p1", target: "memory" as const, payload: { kind: "avoid", content: "No emojis in captions" }, reason: "You removed emojis from the last three captions." }];


  const notes = [{ id: "n1", kind: "trend", title: "Slow pour videos are getting saved", summary: "Close ups of latte art and pour overs are among the most saved café posts this month.", sources: [{ title: "Example source", url: "https://example.com" }], created_at: day(3) },
    { id: "n2", kind: "audience", title: "Remote workers look for quiet weekday spots", summary: "Searches for cafés with wifi and outlets peak on weekday mornings.", sources: [], created_at: day(5) }];
  const rival = { id: "e1", name: "Rival Café", url: null, website: "https://rival.example.com", links: [{ network: "instagram", url: "https://www.instagram.com/rival" }, { network: "tiktok", url: "https://www.tiktok.com/@rival" }], notes: null, last_researched_at: day(2) };
  const other = { id: "e2", name: "Corner Roasters", url: null, website: null, links: [{ network: "instagram", url: "https://www.instagram.com/corner" }], notes: "Opened last spring two blocks away", last_researched_at: null };
  const rivalAnalysis = { summary: "A polished specialty café that leans on product photography and seasonal drink launches.", positioning: "Premium, design-led, for coffee enthusiasts.", audience: "Young professionals and visitors looking for a photogenic spot.", content_pillars: ["Seasonal drinks", "Latte art", "Interior design"], formats: ["Reels of drink making", "Carousels of the menu"], posting_pattern: "About four posts a week, mostly mornings.",
    what_works: ["Close up drink videos", "Consistent warm color grading"], weaknesses: ["Little about the people behind the counter", "No clear offers or calls to action"], opportunities: ["Show the baristas and regulars", "Weekly brunch series with a clear call to book"],
    content_ideas: [{ title: "Meet the barista: 30 seconds behind the counter", format: "reel" as const, network: "instagram" as const, why: "They never show their team; we can." }, { title: "This week's brunch, slide by slide", format: "carousel" as const, network: "instagram" as const, why: "Their menu carousels do well, ours can add booking." }],
    sources: [{ title: "rival.example.com", url: "https://rival.example.com" }], confidence_note: "Instagram numbers were not visible; based on the website and search results." };
  const data: AnalyticsData = { accounts: [], metrics: [], posts: [] };
  for (const network of ["instagram", "tiktok"] as const) {
    const c = fakeConnector(network), tk = { accessToken: "x" };
    data.accounts.push({ id: network, network, handle: `demo_${network}`, last_synced_at: now.toISOString(), status: "active" });
    for (let i = 30; i >= 0; i--) data.metrics.push({ network, day: day(i).slice(0, 10), metric: "followers", value: (network === "instagram" ? 1180 : 480) + (30 - i) * 2 });
    for (const p of await c.fetchPosts(tk, { limit: 30 })) data.posts.push({ network, publishedAt: p.publishedAt, mediaType: p.mediaType, caption: p.caption, permalink: p.permalink, metrics: p.metrics });
  }
  const client = { id: "00000000-0000-0000-0000-000000000001", name: "Café Luna", languages: ["en", "fr"], markets: ["Canada"], timezone: "America/Toronto", primary_color: "#ff4e1b", accent_color: "#ff8c6b", branding_locked: false,
    palette: [{ name: "Espresso", hex: "#3b2417", role: "primary" }, { name: "Oat", hex: "#efe4d2", role: "background" }, { name: "Moon", hex: "#f2c14e", role: "accent" }], font: "Bricolage Grotesque", body_font: "Inter" };
  const TABS = ["profile", "agent", "research", "competitors", "insights", "branding", "connections", "users"];
  const labels: Record<string, string> = { profile: "Profile", agent: "Agent", research: "Research", competitors: "Competitors", insights: "Insights", branding: "Branding", connections: "Connections", users: "Users" };

  return (
    <div className="shell">
      <Sidebar menuLabel="Menu" logo={<div className="logo brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="brand-logo" src="/brand/orbita-logo-light.svg" alt="Orbita" width={716} height={203} /></div>} foot={<div className="sidebar-foot">Protected session</div>}>
        <Nav locale={locale} items={[{ href: "dashboard", label: "Home" }, { href: "posts", label: "Posts" }, { href: "agent", label: "Agent" }, { href: "dev/preview-client", label: "Clients" }, { href: "settings", label: "Settings" }]} />
      </Sidebar>
      <main className="content">
        {tab === "new" ? (<><p className="eyebrow">Posts</p><h1>Create post</h1><CreatePostFlow locale={locale} staff clients={[{ id: client.id, name: client.name }]} initialClient={client.id} initialDate="" postsBase="#" agentBase="#" /></>) : (<>
        <p className="eyebrow">Clients</p>
        <div className="page-head"><h1 className="h1-client">{client.name}</h1><div className="btn-row"><a className="btn ghost" href="#">Content calendar</a><a className="btn" href="?tab=new">Create post</a></div></div>
        <Tabs label="Clients" current={tab} items={TABS.map((x) => ({ key: x, label: labels[x], href: href(x) }))} />
        {tab === "profile" && <ProfileView locale={locale} client={client} ctx={{ briefRow, memories, sources, proofItems: ["Open since 2019 (source: owner)"], rules: [] }} proposals={proposals} staff clientId={client.id} learnedHref="?tab=learned" memoryTotal={memories.length} />}
        {tab === "learned" && <><p className="page-intro stat-vs">Preview of the full page</p><MemoriesView locale={locale} memories={memories} clientId={client.id} /></>}
        {tab === "agent" && (<>
          <Tabs sub label="Agent" current={view} items={[["chat", "Chat"], ["strategy", "Strategy and research"], ["audit", "Audit"]].map(([k, l]) => ({ key: k, label: l, href: href("agent", k) }))} />
          {view === "strategy" && <StrategyView locale={locale} strategy={strategy} askHref={() => "#"} />}
          {view === "audit" && <AuditView locale={locale} audit={audit} sources={sources} askHref={() => "#"} profileHref="#" />}
          {view === "chat" && <div className="agent-grid"><AgentChat locale={locale} initialMessages={[]} initialConversationId={null} /><aside className="agent-side"><ContentSuggestions proposals={[]} /><ProfileNudge score={62} missing={["proof", "personas"]} pendingKnowledge={1} profileHref="#" /></aside></div>}
        </>)}
        {tab === "research" && <ResearchView locale={locale} clientId={client.id} notes={notes} />}
        {tab === "competitors" && <CompetitorsView locale={locale} clientId={client.id} competitors={[rival, other]} latest={new Map([["e1", rivalAnalysis]])} detailBase="?tab=competitor&id=" />}
        {tab === "competitor" && <CompetitorDetailView locale={locale} clientId={client.id} staff competitor={rival} analysis={{ id: "a1", createdAt: day(2), data: rivalAnalysis }} listHref="?tab=competitors" chatHref="#" calendarHref="#" />}
        {tab === "insights" && <InsightsView locale={locale} data={data} audit={audit} strategy={strategy} pendingSuggestions={1} links={{ connect: "#", audit: "#", recommend: "#", strategy: "#", review: "#" }} now={now} />}
        {tab === "branding" && <BrandingPanel locale={locale} client={client} canEdit isAdmin logos={{ light: "/brand/orbita-logo.svg", dark: "/brand/orbita-logo-light.svg" }} references={[{ id: "f1", kind: "style", caption: "Warm morning light, wood counter", url: "/brand/orbita-logo.png", width: null, height: null }, { id: "f2", kind: "avoid", caption: "No stock photos with fake smiles", url: "/brand/orbita-mark.svg", width: null, height: null }]} />}
        </>)}
      </main>
    </div>
  );
}
