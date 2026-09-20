// "Three retries, 5, 20 and 60 minute backoff" (build plan step 0.6). pg-boss's
// own `retryBackoff` only does exponential doubling, which can't hit this exact
// sequence, so the queue schedules its own retries via `startAfter` using this
// table instead of pg-boss's built-in retry counter.
const RETRY_DELAYS_SECONDS = [5 * 60, 20 * 60, 60 * 60] as const;

export const MAX_RETRIES = RETRY_DELAYS_SECONDS.length;

/**
 * `retryCount` is 1 for the first retry (i.e. the second attempt overall).
 * Returns null once `retryCount` exceeds MAX_RETRIES: the caller should give
 * up and record the run as failed rather than scheduling another attempt.
 */
export function nextRetryDelaySeconds(retryCount: number): number | null {
  return RETRY_DELAYS_SECONDS[retryCount - 1] ?? null;
}
