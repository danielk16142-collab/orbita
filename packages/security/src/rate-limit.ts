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
