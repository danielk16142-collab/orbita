import "server-only";
import { createConnector, type ConnectorNetwork, type TokenSet } from "@orbita/connectors";
import { decryptSecret, encryptSecret } from "@orbita/security/crypto";

/** Binds an encrypted token blob to ONE client + network + account, so it can't be moved to another record. */
export const tokenContext = (clientId: string, network: string, externalId: string) => `client:${clientId}:${network}:${externalId}`;
export const sealTokens = (t: TokenSet, clientId: string, network: string, externalId: string) => encryptSecret(JSON.stringify(t), tokenContext(clientId, network, externalId));
export const openTokens = (blob: string, clientId: string, network: string, externalId: string): TokenSet => JSON.parse(decryptSecret(blob, tokenContext(clientId, network, externalId)));

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
/** Where to send the person after connecting: their Connections tab (staff) or portal settings (client), with a result flag such as "connected=1". */
export function connectionsUrl(locale: string, role: string, clientId: string, result: string) {
  const u = new URL(`${appUrl()}${role === "client" ? `/${locale}/portal/settings` : `/${locale}/clients/${clientId}`}`);
  if (role !== "client") u.searchParams.set("tab", "connections");
  for (const [k, v] of new URLSearchParams(result)) u.searchParams.set(k, v);
  return u.toString();
}
export const redirectUriFor = (network: ConnectorNetwork) => `${appUrl()}/api/connect/${network}/callback`;
export const connectorFor = (network: ConnectorNetwork) => createConnector(network);
