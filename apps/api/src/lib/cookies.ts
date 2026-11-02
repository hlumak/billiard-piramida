import type { FastifyReply } from 'fastify';
import { ADMIN_SESSION_TTL_MS } from './admin-session.ts';

/**
 * Session cookies. The secret (JWT / admin token) lives in an HttpOnly cookie
 * unreadable by JS (XSS can't exfiltrate it); a companion non-HttpOnly flag lets
 * the client gate its UI synchronously without exposing anything sensitive.
 */
export const USER_TOKEN_COOKIE = 'token';
export const USER_FLAG_COOKIE = 'piramida.auth';
export const ADMIN_TOKEN_COOKIE = 'admin_token';
export const ADMIN_FLAG_COOKIE = 'piramida.admin';

const USER_MAX_AGE_S = 30 * 24 * 60 * 60; // matches the JWT's 30d expiry

/** Base options: Lax blocks the cookie on cross-site POSTs (CSRF defense); the
 *  app is same-site in dev (localhost) and same-origin in prod (nginx). */
function base(secure: boolean) {
  return { path: '/', sameSite: 'lax', secure } as const;
}

export function setUserCookies(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(USER_TOKEN_COOKIE, token, {
    ...base(secure),
    httpOnly: true,
    maxAge: USER_MAX_AGE_S
  });
  reply.setCookie(USER_FLAG_COOKIE, '1', {
    ...base(secure),
    httpOnly: false,
    maxAge: USER_MAX_AGE_S
  });
}

export function clearUserCookies(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(USER_TOKEN_COOKIE, { ...base(secure), httpOnly: true });
  reply.clearCookie(USER_FLAG_COOKIE, { ...base(secure), httpOnly: false });
}

/** Only the admin API ever reads the session, so only it is ever sent it —
 *  not every page request to the web server. */
const ADMIN_COOKIE_PATH = '/api/admin';

const ADMIN_MAX_AGE_S = ADMIN_SESSION_TTL_MS / 1000;

/**
 * Admin cookies persist across browser restarts for as long as the session
 * value inside them is valid (see admin-session.ts); they used to be
 * browser-session cookies, which phones drop all the time.
 */
export function setAdminCookies(reply: FastifyReply, session: string, secure: boolean): void {
  reply.setCookie(ADMIN_TOKEN_COOKIE, session, {
    ...base(secure),
    path: ADMIN_COOKIE_PATH,
    httpOnly: true,
    maxAge: ADMIN_MAX_AGE_S
  });
  reply.setCookie(ADMIN_FLAG_COOKIE, '1', {
    ...base(secure),
    httpOnly: false,
    maxAge: ADMIN_MAX_AGE_S
  });
}

export function clearAdminCookies(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(ADMIN_TOKEN_COOKIE, {
    ...base(secure),
    path: ADMIN_COOKIE_PATH,
    httpOnly: true
  });
  // Sessions from before the cookie was scoped sat on "/" — clear that one too
  reply.clearCookie(ADMIN_TOKEN_COOKIE, { ...base(secure), httpOnly: true });
  reply.clearCookie(ADMIN_FLAG_COOKIE, { ...base(secure), httpOnly: false });
}
