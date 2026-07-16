import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyError } from 'fastify';
import { createDb, type Db } from './db/client.ts';
import { AvailabilityHub } from './lib/availability-hub.ts';
import { ERROR_RESPONSE } from './lib/schemas.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { liveRoutes } from './routes/live.ts';
import { availabilityRoutes } from './routes/availability.ts';
import { users } from './db/schema.ts';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { bookingRoutes } from './routes/bookings.ts';
import { menuRoutes } from './routes/menu.ts';
import { tableRoutes } from './routes/tables.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    availabilityHub: AvailabilityHub;
    /** Secure flag for auth cookies (true in prod/https). */
    cookieSecure: boolean;
    /** Resolves the signed-in user from the JWT (Authorization header or cookie), or null. */
    authenticatedUser: (request: FastifyRequest) => Promise<typeof users.$inferSelect | null>;
  }
}

export interface AppOptions {
  databaseUrl: string;
  logger?: boolean | { level: string };
  /** Explicit CORS allowlist; undefined reflects any origin (dev). */
  allowedOrigins?: string[] | undefined;
  /** Shared secret for /api/admin; admin routes 503 when unset. */
  adminToken?: string | undefined;
  /** JWT signing secret; auth routes 503 when unset (accounts stay optional). */
  jwtSecret?: string | undefined;
  /** Secure flag on auth cookies — on in prod (https), off in dev (http). */
  cookieSecure?: boolean | undefined;
}

export async function buildApp({
  databaseUrl,
  logger = true,
  allowedOrigins,
  adminToken,
  jwtSecret,
  cookieSecure = false
}: AppOptions) {
  const app = Fastify({
    logger:
      typeof logger === 'object'
        ? { ...logger, redact: { paths: ['req.headers.authorization'], remove: true } }
        : logger,
    // Behind exactly one nginx reverse proxy: trust only the last hop so
    // request.ip is the address nginx appended, not a client-forged
    // X-Forwarded-For (which would let anyone rotate IPs past the rate limits).
    trustProxy: 1
  }).withTypeProvider<TypeBoxTypeProvider>();

  const { db, pool } = createDb(databaseUrl);
  // A pg Pool emits 'error' when an idle backend connection dies (e.g. Postgres
  // restart); with no listener that throws as an uncaughtException and kills the
  // process. Log and let the pool recycle the client on next checkout.
  pool.on('error', err => app.log.error({ err }, 'idle postgres client error'));
  app.decorate('db', db);
  app.decorate('availabilityHub', new AvailabilityHub());
  app.decorate('cookieSecure', cookieSecure);
  app.addHook('onClose', async () => {
    await pool.end();
  });

  // Await plugin registration so their hooks exist BEFORE routes are defined —
  // hooks only apply to routes registered after them.
  await app.register(helmet);
  await app.register(cors, {
    origin: allowedOrigins ?? true,
    // PATCH is used by profile and admin menu updates
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Auth rides in cookies now, so cross-origin requests must send credentials
    credentials: true
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });
  await app.register(websocket, {
    options: { maxPayload: 1024 }
  });
  // Parses request.cookies and enables reply.setCookie/clearCookie; must load
  // before jwt so jwt can read the token from the cookie.
  await app.register(cookie);
  // Registered even when auth is disabled (routes 503) so jwtSign/jwtVerify exist.
  // Tokens expire (low-stakes accounts, no server-side revocation) — jwtVerify
  // rejects expired ones and the web client treats 401 as signed-out. The token
  // is read from the HttpOnly cookie, falling back to the Authorization header.
  await app.register(jwt, {
    secret: jwtSecret ?? 'auth-disabled-placeholder',
    sign: { expiresIn: '30d' },
    cookie: { cookieName: 'token', signed: false }
  });

  app.decorate('authenticatedUser', async (request: FastifyRequest) => {
    if (jwtSecret === undefined) return null;
    try {
      const payload = await request.jwtVerify<{ sub: string }>();
      const [user] = await app.db.select().from(users).where(eq(users.id, payload.sub));
      return user ?? null;
    } catch {
      return null;
    }
  });

  // Keep handler-emitted machine-readable codes ({ error: 'slot_taken' }) intact;
  // reshape framework errors and never leak internals on 5xx.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'validation_error' });
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(500).send({ error: 'internal_error' });
    }
    request.log.info({ err: error }, 'request rejected');
    return reply.code(statusCode).send({ error: 'bad_request' });
  });

  app.get(
    '/health',
    { schema: { response: { 200: Type.Object({ status: Type.String() }) } } },
    async () => ({ status: 'ok' })
  );

  // Readiness: verifies the database is reachable
  app.get(
    '/health/ready',
    {
      schema: {
        response: { 200: Type.Object({ status: Type.String() }), '5xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      try {
        await app.db.execute(sql`select 1`);
        return { status: 'ready' };
      } catch (err) {
        request.log.error({ err }, 'readiness check failed');
        return reply.code(503).send({ error: 'database_unavailable' });
      }
    }
  );

  tableRoutes(app);
  availabilityRoutes(app);
  menuRoutes(app);
  bookingRoutes(app);
  liveRoutes(app);
  authRoutes(app, jwtSecret !== undefined);
  await adminRoutes(app, adminToken);

  return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
