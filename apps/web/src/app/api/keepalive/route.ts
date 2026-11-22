import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Keeps the Supabase project awake: Supabase pauses a project after about a week without activity, and then every page
 * times out. A scheduled GitHub job (.github/workflows/keepalive.yml) calls this twice a week; it makes one tiny database
 * request and returns nothing but ok/not ok, so it is safe to leave public. A failure returns 503 so the job turns red.
 */
export async function GET() {
  try {
    const { error } = await supabaseAdmin().from("agencies").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error(error.code ?? "query failed");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("keepalive failed:", e instanceof Error ? e.message : "error");
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
