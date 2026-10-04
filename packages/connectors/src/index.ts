import { fakeConnector } from "./fake";
import { instagramConnector } from "./instagram";
import { tiktokConnector } from "./tiktok";
import type { Connector, ConnectorNetwork } from "./types";

export * from "./types";
export * from "./state";
export { readJson } from "./http";
export { instagramConnector, tiktokConnector, fakeConnector };

type Env = Record<string, string | undefined>;

/** Credentials for a network, or null if the developer app has not been configured. */
export function connectorConfigured(network: ConnectorNetwork, env: Env = process.env): boolean {
  if (fakeEnabled(env)) return true;
  return network === "instagram" ? !!(env.META_APP_ID && env.META_APP_SECRET) : !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
}

/** Generated data only in development: CONNECTORS_FAKE=1 is ignored when NODE_ENV is production. */
export function fakeEnabled(env: Env = process.env): boolean {
  return env.CONNECTORS_FAKE === "1" && env.NODE_ENV !== "production";
}

export function createConnector(network: ConnectorNetwork, env: Env = process.env, fetchImpl?: typeof fetch): Connector | null {
  if (fakeEnabled(env)) return fakeConnector(network);
  if (!connectorConfigured(network, env)) return null;
  return network === "instagram"
    ? instagramConnector({ clientId: env.META_APP_ID!, clientSecret: env.META_APP_SECRET!, fetchImpl, graphVersion: env.INSTAGRAM_GRAPH_VERSION })
    : tiktokConnector({ clientId: env.TIKTOK_CLIENT_KEY!, clientSecret: env.TIKTOK_CLIENT_SECRET!, fetchImpl });
}
export * from "./sync";
