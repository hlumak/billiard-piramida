import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyError } from 'fastify';
import { createDb, type Db } from './db/client.ts';
import { AvailabilityHub } from './lib/availability-hub.ts';
import { VenueConfigStore } from './services/venue-config.ts';
import { ImageStore, UPLOADS_URL_PREFIX } from './services/images.ts';
import { DEFAULT_TRUSTED_PROXIES, DEFAULT_UPLOADS_DIR } from './lib/config.ts';
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
import { newsRoutes } from './routes/news.ts';
import { venueConfigRoutes } from './routes/venue-config.ts';
import { tableRoutes } from './routes/tables.ts';
import { tournamentRoutes } from './routes/tournaments.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    availabilityHub: AvailabilityHub;
    /** Staff-editable rates and opening hours, cached — see VenueConfigStore */
    venueConfig: VenueConfigStore;
    /** Staff-uploaded pictures on disk, served under /api/uploads/ */
    images: ImageStore;
    /** Meta Graph app token for the Instagram post importer; null = scrape only */
    oembedToken: string | null;
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
  /**
   * Global per-IP request ceiling per minute. Routes that set their own
   * `config.rateLimit` are unaffected. Tests raise it because Fastify's
   * `inject` gives every request the same source address, so the whole suite
   * shares one bucket that a real client never would.
   */
  rateLimitMax?: number | undefined;
  /**
   * Peers whose X-Forwarded-* headers are trusted: comma-separated IPs/CIDRs or
   * @fastify/proxy-addr presets. Default covers nginx on the same host or in a
   * container on the same private network.
   */
  trustedProxies?: string | undefined;
  /** Directory for staff-uploaded pictures; created if missing. */
  uploadsDir?: string | undefined;
  /** Meta Graph app token for Instagram oEmbed; the importer scrapes og:image without it. */
  oembedToken?: string | undefined;
}

export async function buildApp({
  databaseUrl,
  logger = true,
  allowedOrigins,
  adminToken,
  jwtSecret,
  cookieSecure = false,
  rateLimitMax = 100,
  trustedProxies = DEFAULT_TRUSTED_PROXIES,
  uploadsDir = DEFAULT_UPLOADS_DIR,
  oembedToken
}: AppOptions) {
  const app = Fastify({
    logger:
      typeof logger === 'object'
        ? { ...logger, redact: { paths: ['req.headers.authorization'], remove: true } }
        : logger,
    // Behind nginx: X-Forwarded-For is honoured only when the connecting peer
    // is one of these addresses/CIDRs, so request.ip (rate-limit key) is the
    // address nginx appended, not a client-forged header. Hop counts
    // (`trustProxy: 1`) fail closed since fastify 5.12 — every request would
    // key on nginx's own address and share one bucket.
    trustProxy: trustedProxies
  }).withTypeProvider<TypeBoxTypeProvider>();

  const { db, pool } = createDb(databaseUrl);
  // A pg Pool emits 'error' when an idle backend connection dies (e.g. Postgres
  // restart); with no listener that throws as an uncaughtException and kills the
  // process. Log and let the pool recycle the client on next checkout.
  pool.on('error', err => app.log.error({ err }, 'idle postgres client error'));
  app.decorate('db', db);
  app.decorate('availabilityHub', new AvailabilityHub());
  app.decorate('venueConfig', new VenueConfigStore(db));
  app.decorate('cookieSecure', cookieSecure);
  const images = new ImageStore(uploadsDir);
  await images.ensureDir();
  app.decorate('images', images);
  app.decorate('oembedToken', oembedToken ?? null);
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
    max: rateLimitMax,
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

  // Uploaded pictures. Names are content hashes (see ImageStore), so a URL never
  // changes meaning and browsers may keep it for a year. Helmet's default
  // Cross-Origin-Resource-Policy is same-origin, which would block <img> from
  // the web dev server (:3000 → :8080); pictures are public, so relax it here.
  await app.register(fastifyStatic, {
    root: images.dir,
    prefix: UPLOADS_URL_PREFIX,
    decorateReply: false,
    index: false,
    list: false,
    maxAge: '365d',
    immutable: true,
    setHeaders: reply => {
      reply.header('cross-origin-resource-policy', 'cross-origin');
    }
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
  venueConfigRoutes(app);
  availabilityRoutes(app);
  menuRoutes(app);
  newsRoutes(app);
  tournamentRoutes(app);
  bookingRoutes(app);
  liveRoutes(app);
  authRoutes(app, jwtSecret !== undefined);
  await adminRoutes(app, adminToken);

  return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
