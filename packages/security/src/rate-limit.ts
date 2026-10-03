/**
 * Fixed-window in-memory limiter. Fine for a single instance and for tests.
 * On Vercel (multiple instances) back this with a shared store (Upstash/Redis) behind
 * the same `RateLimiter` interface.
 */
export interface RateLimiter {
  hit(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
}

export function memoryRateLimiter(limit: number, windowMs: number, now = () => Date.now()): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key) {
      const t = now();
      let b = buckets.get(key);
      if (!b || b.resetAt <= t) { b = { count: 0, resetAt: t + windowMs }; buckets.set(key, b); }
      b.count++;
      return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
    },
  };
}

/**
 * Shared fixed-window limiter on Upstash Redis (REST). Works across serverless instances.
 * If Redis is unreachable it falls back to the per-instance limiter: failing closed would
 * lock everyone out of sign-in during a Redis outage.
 */
export function upstashRateLimiter(
  cfg: { url: string; token: string; prefix?: string },
  limit: number,
  windowMs: number,
  fetchImpl: typeof fetch = fetch,
): RateLimiter {
  const fallback = memoryRateLimiter(limit, windowMs);
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  return {
    async hit(key) {
      try {
        const k = `${cfg.prefix ?? "rl"}:${key}`;
        const res = await fetchImpl(`${cfg.url.replace(/\/$/, "")}/pipeline`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
          body: JSON.stringify([["INCR", k], ["EXPIRE", k, windowSec, "NX"], ["PTTL", k]]),
          signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) throw new Error("upstash " + res.status);
        const out = (await res.json()) as { result: number }[];
        const count = Number(out[0].result);
        const ttl = Number(out[2].result);
        return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: Date.now() + (ttl > 0 ? ttl : windowMs) };
      } catch {
        return fallback.hit(key);
      }
    },
  };
}
