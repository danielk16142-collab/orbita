"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

type Client = { id: string; name: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The client sections, in menu order. "calendar" is the posts calendar filtered to the client; the rest are client page tabs. */
export const CLIENT_SECTIONS = ["profile", "strategy", "agent", "research", "competitors", "calendar", "insights", "branding", "connections", "users"] as const;
type Section = (typeof CLIENT_SECTIONS)[number];

/** Which client and section a URL belongs to. Null client: a general page (Home, the client list, Settings, all posts). */
export function locate(path: string, query: URLSearchParams, locale: string): { client: string | null; section: Section | null; general: boolean } {
  const rest = path.startsWith(`/${locale}/`) ? path.slice(locale.length + 2) : path.replace(/^\//, "");
  const [first, second, third] = rest.split("/");
  const qc = query.get("client");
  const fromQuery = qc && UUID.test(qc) ? qc : null;
  if (first === "clients" && second && UUID.test(second)) {
    if (third === "competitors") return { client: second, section: "competitors", general: false };
    if (third === "learned") return { client: second, section: "profile", general: false };
    const tab = query.get("tab") === "overview" ? "profile" : query.get("tab");
    return { client: second, section: (CLIENT_SECTIONS as readonly string[]).includes(tab ?? "") && tab !== "calendar" ? (tab as Section) : "profile", general: false };
  }
  if (first === "posts") {
    // A post or the new post form: stays with the client last open (the post's own page does not name it in the URL).
    if (second) return { client: fromQuery, section: "calendar", general: false };
    return fromQuery ? { client: fromQuery, section: "calendar", general: false } : { client: null, section: null, general: true };
  }
  if ((first === "strategy" || first === "agent") && fromQuery) return { client: fromQuery, section: first, general: false };
  return { client: null, section: null, general: true };
}

/**
 * The agency sidebar. On general pages: Home, Content calendar, Strategy, Agent, Clients, Settings. Inside a client: Home and
 * Clients, then the client's name (with a switcher) and every section of that client, so any section is one click away.
 */
export function AgencyNav({ locale, clients, at }: { locale: string; clients: Client[]; /** development previews only: render as if on this URL */ at?: string }) {
  const t = useTranslations("nav");
  const tt = useTranslations("clients.tabs");
  const tp = useTranslations("posts");
  const realPath = usePathname();
  const realQuery = useSearchParams();
  const fake = at ? new URL(at, "http://x") : null;
  const path = fake ? fake.pathname : realPath;
  const query = fake ? fake.searchParams : realQuery;
  const router = useRouter();
  const here = locate(path, new URLSearchParams(query.toString()), locale);
  // Remember the client while on pages that do not name it (a post's page); leave it on general pages.
  const [sticky, setSticky] = useState<string | null>(null);
  useEffect(() => { if (here.client) setSticky(here.client); else if (here.general) setSticky(null); }, [here.client, here.general]);
  const clientId = here.client ?? (here.general ? null : sticky);
  const client = clients.find((c) => c.id === clientId) ?? null;
  // A client added a moment ago is not in the list the layout loaded yet: fetch it again once.
  const [refreshed, setRefreshed] = useState<string | null>(null);
  useEffect(() => { if (clientId && !client && refreshed !== clientId) { setRefreshed(clientId); router.refresh(); } }, [clientId, client, refreshed, router]);

  const L = (p: string) => `/${locale}/${p}`;
  const isGeneral = (p: string) => path === L(p) && !client;
  const sectionHref = (id: string, s: Section) => (s === "calendar" ? L(`posts?client=${id}`) : L(`clients/${id}?tab=${s}`));
  const label = (s: Section) => (s === "calendar" ? tp("calendar") : tt(s));
  const link = (href: string, text: string, current: boolean, sub = false) => (
    <Link key={href} href={href} className={sub ? "nav-sub" : undefined} aria-current={current ? "page" : undefined}>{text}</Link>
  );

  return (
    <nav className="nav" aria-label="Main">
      {link(L("dashboard"), t("home"), path === L("dashboard"))}
      {!client && <>
        {link(L("posts"), tp("calendar"), isGeneral("posts"))}
        {link(L("strategy"), t("strategy"), isGeneral("strategy"))}
        {link(L("agent"), t("agent"), isGeneral("agent"))}
      </>}
      {link(L("clients"), t("clients"), path === L("clients"))}
      {client && (
        <div className="nav-client" role="group" aria-labelledby="nav-client-name">
          <p className="nav-client-name" id="nav-client-name">{client.name}</p>
          {clients.length > 1 && (
            <label className="nav-switch">
              <span className="sr-only">{t("switchClient")}</span>
              <select value="" onChange={(e) => { if (e.target.value) router.push(sectionHref(e.target.value, here.section ?? "profile")); }}>
                <option value="" disabled>{t("switchClient")}…</option>
                {clients.filter((c) => c.id !== client.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {CLIENT_SECTIONS.map((s) => link(sectionHref(client.id, s), label(s), here.section === s, true))}
          <Link className="nav-new" href={L(`posts/new?client=${client.id}`)}>+ {tp("createPost")}</Link>
        </div>
      )}
      {link(L("settings"), t("settings"), path === L("settings") || path.startsWith(`${L("settings")}/`))}
    </nav>
  );
}
