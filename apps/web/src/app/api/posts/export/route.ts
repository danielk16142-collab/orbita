import { NextResponse, type NextRequest } from "next/server";
import { toCsv, validDate, type ExportRow } from "@orbita/content";
import { postActor } from "@/lib/posts/access";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** CSV of the posts in a date range. Same rules as the screen: the caller's own database session decides what is visible. */
export async function GET(req: NextRequest) {
  const a = await postActor();
  if (!a.ok) return new NextResponse(a.error, { status: a.error === "unauthorized" ? 401 : 403 });
  const { sb, userId, profile } = a.value;
  if (!(await limiter("posts-export", 10, 10 * 60_000).hit(userId)).allowed) return new NextResponse("Too many requests", { status: 429 });
  const sp = req.nextUrl.searchParams;
  let q = sb.from("posts").select("planned_date, suggested_time, network, type, status, language, pillar, idea, caption, hashtags, clients(name)").order("planned_date", { ascending: true, nullsFirst: false }).limit(2000);
  if (validDate(sp.get("from"))) q = q.gte("planned_date", sp.get("from")!);
  if (validDate(sp.get("to"))) q = q.lte("planned_date", sp.get("to")!);
  if (["instagram", "tiktok", "linkedin", "youtube", "facebook"].includes(sp.get("network") ?? "")) q = q.eq("network", sp.get("network")!);
  if (["idea", "draft", "approved", "scheduled", "published"].includes(sp.get("status") ?? "")) q = q.eq("status", sp.get("status")!);
  if (profile.role !== "client" && /^[0-9a-f-]{36}$/i.test(sp.get("client") ?? "")) q = q.eq("client_id", sp.get("client")!);
  const { data } = await q;
  const rows: ExportRow[] = (data ?? []).map((p) => ({ date: p.planned_date, time: p.suggested_time, client: (p.clients as unknown as { name: string } | null)?.name ?? "", network: p.network, format: p.type, status: p.status, language: p.language, pillar: p.pillar, idea: p.idea, caption: p.caption, hashtags: p.hashtags ?? [] }));
  await audit({ agencyId: profile.agency_id, actor: userId, action: "posts.export", meta: { rows: rows.length } });
  return new NextResponse(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="orbita-posts.csv"', "Cache-Control": "no-store" } });
}
