import { bearerMatches } from "@orbita/security/bearer";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runSync } from "@/lib/connectors/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const MIN_AGE_MS = 3 * 3_600_000; // do not re-sync an account that was synced in the last 3 hours

const authorized = (req: Request) => bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET); // fails closed

/** Scheduled sync of all active accounts, oldest first, within a time budget. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const started = Date.now();
  const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();
  const { data: accounts } = await supabaseAdmin().from("social_accounts").select("id").eq("status", "active")
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`).order("last_synced_at", { ascending: true, nullsFirst: true }).limit(200);
  let ok = 0, failed = 0, skipped = 0;
  for (const a of accounts ?? []) {
    if (Date.now() - started > BUDGET_MS) { skipped++; continue; }
    const r = await runSync(a.id);
    if (r.ok) ok++; else failed++;
  }
  return NextResponse.json({ ok, failed, skipped });
}
