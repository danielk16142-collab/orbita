export const CONNECTOR_NETWORKS = ["instagram", "tiktok"] as const;
export type ConnectorNetwork = (typeof CONNECTOR_NETWORKS)[number];

export interface TokenSet { accessToken: string; refreshToken?: string; expiresAt?: string; scopes?: string[] }
export interface AccountInfo { externalId: string; handle: string | null; displayName: string | null; followers: number | null; following: number | null; mediaCount: number | null; totalLikes?: number | null }
export interface DailyMetric { day: string; metric: string; value: number } // day = YYYY-MM-DD (UTC)
export interface PostRecord { externalId: string; publishedAt: string | null; permalink: string | null; caption: string | null; mediaType: string | null; metrics: Record<string, number> }

export interface Connector {
  network: ConnectorNetwork;
  /** Read-only permissions requested, shown to the user before they connect. */
  scopes: readonly string[];
  authUrl(p: { state: string; redirectUri: string }): string;
  exchangeCode(p: { code: string; redirectUri: string }): Promise<TokenSet>;
  needsRefresh(t: TokenSet, now?: Date): boolean;
  refresh(t: TokenSet): Promise<TokenSet>;
  fetchAccount(t: TokenSet): Promise<AccountInfo>;
  /** Daily series the platform provides natively (may be empty: the sync engine also snapshots totals daily). */
  fetchDailyMetrics(t: TokenSet, range: { since: Date; until: Date }): Promise<DailyMetric[]>;
  fetchPosts(t: TokenSet, opts: { limit: number }): Promise<PostRecord[]>;
  revoke(t: TokenSet): Promise<void>;
}

/** The platform said the token is no longer valid: the user must reconnect. */
export class ConnectorAuthError extends Error {}
/** The platform asked us to slow down. */
export class ConnectorRateLimitError extends Error { constructor(m: string, readonly retryAfterSec = 60) { super(m); } }
/** Any other platform error. The message never contains tokens or URLs. */
export class ConnectorApiError extends Error {}

export type ConnectorConfig = { clientId: string; clientSecret: string; fetchImpl?: typeof fetch; graphVersion?: string };
