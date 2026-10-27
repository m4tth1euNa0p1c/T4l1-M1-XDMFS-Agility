import { XdmfsError } from "./errors.js";

export interface RetryPolicy {
  /** Total attempts including the first one. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 8_000 };

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries only errors flagged retryable (rate limit, timeout, unavailable).
 * Honors retry-after when the upstream provides it. Backoff is exponential
 * without jitter so tests stay deterministic.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY,
  sleep: Sleep = realSleep,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof XdmfsError && error.retryable;
      if (!retryable || attempt === policy.maxAttempts) throw error;
      const backoff = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
      const wait = Math.min(error.retryAfterMs ?? backoff, policy.maxDelayMs);
      await sleep(wait);
    }
  }
  throw lastError;
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return undefined;
}
