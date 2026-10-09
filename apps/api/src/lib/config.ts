/** Single source for environment configuration. */
import { join } from 'node:path';

/** Dev-only fallback for tooling (seed, tests, drizzle-kit) — never used by the server. */
export const LOCAL_DATABASE_URL = 'postgres://piramida:piramida@localhost:5432/piramida';

/** A CORS allowlist entry: an exact origin, or a pattern for the dev default. */
export type AllowedOrigin = string | RegExp;

export interface ApiConfig {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: string;
  /** CORS allowlist; undefined = same-origin only (no CORS headers at all). */
  allowedOrigins: AllowedOrigin[] | undefined;
  /** Shared secret for /api/admin; admin stays disabled (503) when unset. */
  adminToken: string | undefined;
  /** JWT signing secret; accounts/auth stay disabled (503) when unset. */
  jwtSecret: string | undefined;
  /** Secure flag on auth cookies — on unless explicitly turned off. */
  cookieSecure: boolean;
  /** Reverse proxies whose X-Forwarded-* headers are trusted (IPs/CIDRs/presets). */
  trustedProxies: string;
  /** Where staff-uploaded pictures are written; served back under /api/uploads/. */
  uploadsDir: string;
  /** Meta Graph app token for Instagram oEmbed lookups; unset = og:image scrape only. */
  metaOembedToken: string | undefined;
}

/** Loopback + RFC 1918: nginx next door, natively or in a container on the docker bridge. */
export const DEFAULT_TRUSTED_PROXIES = 'loopback,uniquelocal';

/** Sibling of src/ inside apps/api — a mounted volume in production (see .env.example). */
export const DEFAULT_UPLOADS_DIR = join(import.meta.dirname, '..', '..', 'uploads');

/** Outside production with no ALLOWED_ORIGINS: the local dev servers, nothing else. */
const DEV_ORIGINS: AllowedOrigin[] = [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

/** The values .env.example ships with — never acceptable in production. */
const PLACEHOLDER_SECRETS = new Set(['change-me', 'change-me-long-random']);

/** Long enough that guessing (or brute-forcing an HS256 key) is not a plan. */
export const MIN_SECRET_LENGTH = 32;

/** Why a secret is unacceptable, or null when it is fine (or unset = feature off). */
export function secretProblem(name: string, value: string | undefined): string | null {
  if (value === undefined) return null;
  if (PLACEHOLDER_SECRETS.has(value)) return `${name} is still the .env.example placeholder`;
  if (value.length < MIN_SECRET_LENGTH) {
    return `${name} is shorter than ${MIN_SECRET_LENGTH} characters (try: openssl rand -hex 32)`;
  }
  return null;
}

/**
 * Fail fast: a missing DATABASE_URL must never silently fall back to localhost,
 * and production must not start with guessable secrets or an open CORS policy.
 * `warn` receives the problems that are tolerated outside production.
 */
export function loadConfig(warn: (message: string) => void = console.warn): ApiConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const production = process.env.NODE_ENV === 'production';
  // Empty means unset, as for the optional settings below
  const adminToken = process.env.ADMIN_TOKEN || undefined;
  const jwtSecret = process.env.JWT_SECRET || undefined;

  const problems = [
    secretProblem('ADMIN_TOKEN', adminToken),
    secretProblem('JWT_SECRET', jwtSecret)
  ].filter(problem => problem !== null);
  if (problems.length > 0) {
    if (production) throw new Error(`Refusing to start: ${problems.join('; ')}`);
    for (const problem of problems) warn(`${problem} — acceptable for local dev only`);
  }

  const listed = process.env.ALLOWED_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(origin => origin !== '');
  return {
    databaseUrl,
    port: Number(process.env.API_PORT ?? 3001),
    // Loopback unless told otherwise (the container image sets 0.0.0.0): a host
    // install must not expose the API port next to the reverse proxy
    host: process.env.API_HOST ?? '127.0.0.1',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    // Same-origin in production unless listed; never "reflect any origin"
    allowedOrigins: listed && listed.length > 0 ? listed : production ? undefined : DEV_ORIGINS,
    adminToken,
    jwtSecret,
    // Browsers accept Secure cookies on http://localhost, so dev needs no opt-out;
    // COOKIE_SECURE=false exists for plain-http hosts other than localhost.
    cookieSecure: process.env.COOKIE_SECURE !== 'false',
    trustedProxies: process.env.TRUSTED_PROXIES || DEFAULT_TRUSTED_PROXIES,
    uploadsDir: process.env.UPLOADS_DIR ?? DEFAULT_UPLOADS_DIR,
    metaOembedToken: process.env.META_OEMBED_TOKEN || undefined
  };
}
