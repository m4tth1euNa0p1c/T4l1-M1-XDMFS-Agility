/**
 * In-memory token bucket per key (client IP). Enough for a single
 * instance; a shared store is needed behind a load balancer.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updated: t };
    const refill = ((t - bucket.updated) / 60_000) * this.refillPerMinute;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refill);
    bucket.updated = t;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) this.buckets.delete(this.buckets.keys().next().value!);
    return true;
  }
}
