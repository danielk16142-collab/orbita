import createIntlMiddleware from "next-intl/middleware";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { securityHeaders } from "@orbita/security/headers";
import { routing } from "./i18n/routing";

const intl = createIntlMiddleware(routing);
// Pages reachable without a session: sign-in and the legal documents (platforms require public policy URLs).
const PUBLIC = /^\/(en|fr|es)\/(login|legal\/[a-z-]+|invite\/[A-Za-z0-9_-]{43})\/?$/;
// Development-only visual preview (the page itself returns 404 in production).
const DEV_PREVIEW = /^\/(en|fr|es)\/dev\/preview\/?$/;

export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const headers = securityHeaders(nonce, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV !== "production",
  });

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"]);

  const res = intl(new NextRequest(req, { headers: reqHeaders }));

  // Refresh the session and gate everything except the login page. Fail closed.
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  let out: NextResponse = res;
  if (!user && !PUBLIC.test(path) && !(process.env.NODE_ENV !== "production" && DEV_PREVIEW.test(path)) && /^\/(en|fr|es)(\/|$)/.test(path)) {
    const locale = path.split("/")[1];
    out = NextResponse.redirect(new URL(`/${locale}/login`, req.url));
    res.cookies.getAll().forEach((c) => out.cookies.set(c));
  }
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };
