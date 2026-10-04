import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { parseMetaSignedRequest } from "@orbita/connectors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/connectors/accounts";
import { limiter } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request-context";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Meta data-deletion callback: when a person asks Meta to delete the data an app holds about them, Meta POSTs a signed_request.
 * We verify the HMAC with the app secret, delete the connected account(s) for that Instagram user id (tokens, metrics and posts
 * cascade), and return the confirmation Meta requires. Also used as the deauthorize callback.
 */
export async function POST(req: Request) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new NextResponse("Not configured", { status: 503 });
  const { ip } = await requestContext();
  if (!(await limiter("meta-deletion", 30, 10 * 60_000).hit(ip ?? "unknown")).allowed) return new NextResponse("Too many requests", { status: 429 });
  const form = await req.formData().catch(() => null);
  const payload = parseMetaSignedRequest(String(form?.get("signed_request") ?? ""), secret);
  if (!payload?.user_id) return new NextResponse("Invalid request", { status: 400 });

  const admin = supabaseAdmin();
  const { data: rows } = await admin.from("social_accounts").delete().eq("network", "instagram").eq("external_id", String(payload.user_id)).select("id, client_id");
  const code = randomBytes(8).toString("hex");
  for (const r of rows ?? []) await audit({ agencyId: null, actor: null, action: "connector.deleted_by_platform", entity: "client", entityId: r.client_id, meta: { network: "instagram", code } });
  return NextResponse.json({ url: `${appUrl()}/en/legal/data-deletion?code=${code}`, confirmation_code: code });
}
