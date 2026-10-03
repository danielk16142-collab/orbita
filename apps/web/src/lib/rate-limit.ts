import "server-only";
import { memoryRateLimiter, upstashRateLimiter, type RateLimiter } from "@orbita/security/rate-limit";

const cache = new Map<string, RateLimiter>();

/**
 * Named limiter. Uses Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set (required in
 * production for multi-instance deployments), otherwise an in-memory limiter for local dev.
 */
export function limiter(name: string, limit: number, windowMs: number): RateLimiter {
  const key = `${name}:${limit}:${windowMs}`;
  let l = cache.get(key);
  if (!l) {
    const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
    l = url && token ? upstashRateLimiter({ url, token, prefix: name }, limit, windowMs) : memoryRateLimiter(limit, windowMs);
    cache.set(key, l);
  }
  return l;
}
