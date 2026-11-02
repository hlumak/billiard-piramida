import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Staff browser sessions. The cookie used to hold ADMIN_TOKEN itself: a copied
 * cookie was the master secret, valid until someone rotated it. Now it holds
 * an expiry plus an HMAC keyed by ADMIN_TOKEN — useless once it expires, and
 * rotating the token still signs everyone out.
 *
 * Staff stay signed in for 30 days (like guests, D11), and a session in use is
 * reissued past its half-life, so only a device left unused for 30 days has to
 * sign in again. Signing in every 12 hours / every browser restart was the
 * staff's main complaint about the panel.
 */
export const ADMIN_SESSION_TTL_MS = 30 * 24 * 3_600_000;
const ADMIN_SESSION_RENEW_BELOW_MS = ADMIN_SESSION_TTL_MS / 2;

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

/** For a session already verified: true once it is past its half-life, so the
 *  guard reissues it at most every 15 days rather than on every request. */
export function adminSessionNeedsRenewal(value: string, now = Date.now()): boolean {
  const expiresAt = Number(value.slice(0, value.indexOf('.')));
  return expiresAt - now < ADMIN_SESSION_RENEW_BELOW_MS;
}
