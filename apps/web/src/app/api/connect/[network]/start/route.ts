import { NextResponse, type NextRequest } from "next/server";
import { CONNECTOR_NETWORKS, deriveStateKey, newNonce, signState, type ConnectorNetwork } from "@orbita/connectors";
import { resolveAgentActor } from "@/lib/agent/access";
import { appUrl, connectorFor, redirectUriFor } from "@/lib/connectors/accounts";
import { limiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const back = (locale: string, role: string, clientId: string, q: string) =>
  `${appUrl()}${role === "client" ? `/${locale}/portal/settings` : `/${locale}/clients/${clientId}?tab=connections`}${q.includes("?") ? "" : "?"}${q}`;

/** Begin connecting a social account. Needs a signed-in user (staff with MFA, or the client's own user). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const locale = ["en", "fr", "es"].includes(sp.get("locale") ?? "") ? (sp.get("locale") as string) : "en";
  if (!(CONNECTOR_NETWORKS as readonly string[]).includes(network)) return new NextResponse("Not found", { status: 404 });
  // A link on another website must not be able to start a connection for a signed-in user.
  if (req.headers.get("sec-fetch-site") === "cross-site") return new NextResponse("Forbidden", { status: 403 });
  if (!appUrl() || !process.env.ORBITA_MASTER_KEY) return new NextResponse("Not configured", { status: 503 });

  const access = await resolveAgentActor(sp.get("clientId"));
  if (!access.ok) return NextResponse.redirect(`${appUrl()}/${locale}/login`);
  const { actor } = access;
  if (!(await limiter("connect-start", 10, 10 * 60_000).hit(actor.userId)).allowed) return new NextResponse("Too many requests", { status: 429 });

  const connector = connectorFor(network as ConnectorNetwork);
  if (!connector) return NextResponse.redirect(back(locale, actor.profile.role, actor.clientId, "error=not_configured"));

  const nonce = newNonce();
  const state = signState({ u: actor.userId, c: actor.clientId, n: network, nonce, l: locale }, deriveStateKey(process.env.ORBITA_MASTER_KEY));
  const res = NextResponse.redirect(connector.authUrl({ state, redirectUri: redirectUriFor(network as ConnectorNetwork) }));
  res.cookies.set("orbita_oauth", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/connect", maxAge: 600 });
  return res;
}
