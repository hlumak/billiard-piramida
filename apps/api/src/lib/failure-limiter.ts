/**
 * Counts failed attempts per key (client IP) in a fixed window and blocks the
 * key once it reaches `max`. Unlike a route's rate limit this only counts
 * failures, so it can guard a check that runs on every route — the admin
 * token is accepted as a header on all of /api/admin, and each wrong guess
 * there is as good as a failed login.
 *
 * In-process only, the same single-node assumption as AvailabilityHub.
 */
export class FailureLimiter {
  readonly #max: number;
  readonly #windowMs: number;
  readonly #failures = new Map<string, { count: number; resetAt: number }>();

  constructor(max: number, windowMs: number) {
    this.#max = max;
    this.#windowMs = windowMs;
  }

  isBlocked(key: string, now = Date.now()): boolean {
    const entry = this.#failures.get(key);
    if (!entry) return false;
    if (entry.resetAt <= now) {
      this.#failures.delete(key);
      return false;
    }
    return entry.count >= this.#max;
  }

  fail(key: string, now = Date.now()): void {
    const entry = this.#failures.get(key);
    if (entry && entry.resetAt > now) {
      entry.count += 1;
      return;
    }
    // Bound memory against a spray of source addresses
    if (this.#failures.size >= 10_000) this.#prune(now);
    this.#failures.set(key, { count: 1, resetAt: now + this.#windowMs });
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#failures) {
      if (entry.resetAt <= now) this.#failures.delete(key);
    }
  }
}
