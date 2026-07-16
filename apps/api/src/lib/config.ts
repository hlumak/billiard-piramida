/** Single source for environment configuration. */

/** Dev-only fallback for tooling (seed, tests, drizzle-kit) — never used by the server. */
export const LOCAL_DATABASE_URL = 'postgres://piramida:piramida@localhost:5432/piramida';

export interface ApiConfig {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: string;
  /** Explicit CORS allowlist; undefined = reflect any origin (dev). */
  allowedOrigins: string[] | undefined;
  /** Shared secret for /api/admin; admin stays disabled (503) when unset. */
  adminToken: string | undefined;
  /** JWT signing secret; accounts/auth stay disabled (503) when unset. */
  jwtSecret: string | undefined;
  /** Set the Secure flag on auth cookies — on in prod (https), off in dev (http). */
  cookieSecure: boolean;
}

/** Fail fast: a missing DATABASE_URL must never silently fall back to localhost. */
export function loadConfig(): ApiConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  return {
    databaseUrl,
    port: Number(process.env.API_PORT ?? 3001),
    host: process.env.API_HOST ?? '0.0.0.0',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()),
    adminToken: process.env.ADMIN_TOKEN,
    jwtSecret: process.env.JWT_SECRET,
    cookieSecure: process.env.NODE_ENV === 'production'
  };
}
