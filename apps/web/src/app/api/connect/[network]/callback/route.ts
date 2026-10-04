import { after, NextResponse, type NextRequest } from "next/server";
import { CONNECTOR_NETWORKS, deriveStateKey, verifyState, type ConnectorNetwork } from "@orbita/connectors";
import { resolveAgentActor } from "@/lib/agent/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { appUrl, connectorFor, redirectUriFor, sealTokens } from "@/lib/connectors/accounts";
import { runSync } from "@/lib/connectors/run";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * OAuth callback. Accepts the platform's redirect only if: the signed state is valid and unexpired, its nonce matches the
 * cookie set in this browser, it was issued to THIS signed-in user for THIS network, and the user may still access that client.
 * The authorization code is never logged and tokens never leave the server.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  if (!(CONNECTOR_NETWORKS as readonly string[]).includes(network) || !process.env.ORBITA_MASTER_KEY) return new NextResponse("Not found", { status: 404 });
  const sp = req.nextUrl.searchParams;
  const state = verifyState(sp.get("state") ?? "", deriveStateKey(process.env.ORBITA_MASTER_KEY));
  const nonce = req.cookies.get("orbita_oauth")?.value;
  const fail = (code: string, locale = "en", to?: string) => { const r = NextResponse.redirect(to ?? `${appUrl()}/${locale}/login?connect=${code}`); r.cookies.delete({ name: "orbita_oauth", path: "/api/connect" }); return r; };
  if (!state || state.n !== network || !nonce || nonce !== state.nonce) return fail("invalid");

  const locale = ["en", "fr", "es"].includes(state.l ?? "") ? (state.l as string) : "en";
  const access = await resolveAgentActor(state.c);
  if (!access.ok || access.actor.userId !== state.u) return fail("invalid", locale);
  const { actor } = access;
  const back = (q: string) => `${appUrl()}${actor.profile.role === "client" ? `/${locale}/portal/settings` : `/${locale}/clients/${actor.clientId}?tab=connections`}?${q}`;

  if (sp.get("error") || !sp.get("code")) return fail("denied", locale, back("connect=denied"));
  if (!(await limiter("connect-callback", 10, 10 * 60_000).hit(actor.userId)).allowed) return fail("rate", locale, back("connect=rate"));
  const connector = connectorFor(network as ConnectorNetwork);
  if (!connector) return fail("not_configured", locale, back("connect=not_configured"));

  try {
    const tokens = await connector.exchangeCode({ code: sp.get("code")!, redirectUri: redirectUriFor(network as ConnectorNetwork) });
    const account = await connector.fetchAccount(tokens);
    const { data, error } = await supabaseAdmin().from("social_accounts").upsert({
      client_id: actor.clientId, network, external_id: account.externalId, handle: account.handle, display_name: account.displayName,
      encrypted_tokens: sealTokens(tokens, actor.clientId, network, account.externalId), scopes: tokens.scopes ?? [...connector.scopes],
      token_expires_at: tokens.expiresAt ?? null, status: "active", last_error: null,
    }, { onConflict: "client_id,network,external_id" }).select("id").single();
    if (error || !data) throw new Error("save failed");
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "connector.connected", entity: "client", entityId: actor.clientId, meta: { network } });
    after(async () => { await runSync(data.id, { backfill: true }); }); // the first sync can take a while: run it after responding
    const r = NextResponse.redirect(back("connected=1"));
    r.cookies.delete({ name: "orbita_oauth", path: "/api/connect" });
    return r;
  } catch {
    return fail("failed", locale, back("connect=failed")); // generic: no provider details, no code, no tokens
  }
}
