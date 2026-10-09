import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Staff browser sessions. The cookie used to hold ADMIN_TOKEN itself: a copied
 * cookie was the master secret, valid until someone rotated it. Now it holds
 * an expiry plus an HMAC keyed by ADMIN_TOKEN — useless after 12 hours, and
 * rotating the token still signs everyone out.
 */
export const ADMIN_SESSION_TTL_MS = 12 * 3_600_000;

function signature(adminToken: string, expiresAt: number): string {
  return createHmac('sha256', adminToken)
    .update(`piramida-admin-session:${expiresAt}`)
    .digest('base64url');
}

/** Constant-time comparison — hash first so lengths always match. */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function issueAdminSession(adminToken: string, now = Date.now()): string {
  const expiresAt = now + ADMIN_SESSION_TTL_MS;
  return `${expiresAt}.${signature(adminToken, expiresAt)}`;
}

export function verifyAdminSession(adminToken: string, value: string, now = Date.now()): boolean {
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const expiresAt = Number(value.slice(0, dot));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  return secretsMatch(value.slice(dot + 1), signature(adminToken, expiresAt));
}
