import { createError } from "h3";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

function prune(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Fixed-window limiter. In-memory and per-instance on purpose: this is a
 * best-effort guard, not a distributed rate limiter. The database is still the
 * authority for account state.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): void {
  const now = Date.now();
  prune(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw createError({
      statusCode: 429,
      statusMessage: "Too many attempts. Try again later.",
      data: { retryAfter },
    });
  }
}
