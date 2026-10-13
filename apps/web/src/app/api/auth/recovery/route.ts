import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { appUrl } from "@/lib/connectors/accounts";

export const dynamic = "force-dynamic";

/** The link in the reset email lands here: trade the one-time code for a session, then ask for the new password. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const locale = ["en", "fr", "es"].includes(sp.get("locale") ?? "") ? (sp.get("locale") as string) : "en";
  const code = sp.get("code");
  if (!code) return NextResponse.redirect(`${appUrl()}/${locale}/forgot-password?error=expired`);
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${appUrl()}/${locale}/forgot-password?error=expired`);
  const res = NextResponse.redirect(`${appUrl()}/${locale}/reset-password`);
  // Marks a browser that came from a reset link, so two-step verification returns to the reset page.
  res.cookies.set("orbita_reset", "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 15 * 60 });
  return res;
}
