/**
 * Drizzle 1.0 RC wraps driver errors in DrizzleQueryError; the pg error code
 * lives somewhere down the `cause` chain.
 */
export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  while (current && typeof current === 'object') {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Postgres exclusion_violation — our booking overlap guard fired. */
export const EXCLUSION_VIOLATION = '23P01';

/** Postgres unique_violation — a UNIQUE constraint (e.g. users.phone) was hit. */
export const UNIQUE_VIOLATION = '23505';
