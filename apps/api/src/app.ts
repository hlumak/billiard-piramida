import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyError } from 'fastify';
import { createDb, type Db } from './db/client.ts';
import { AvailabilityHub } from './lib/availability-hub.ts';
import { ERROR_RESPONSE } from './lib/schemas.ts';
import { adminRoutes } from './routes/admin.ts';
import { liveRoutes } from './routes/live.ts';
import { availabilityRoutes } from './routes/availability.ts';
import { bookingRoutes } from './routes/bookings.ts';
import { menuRoutes } from './routes/menu.ts';
import { tableRoutes } from './routes/tables.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    availabilityHub: AvailabilityHub;
  }
}

export interface AppOptions {
  databaseUrl: string;
  logger?: boolean | { level: string };
  /** Explicit CORS allowlist; undefined reflects any origin (dev). */
  allowedOrigins?: string[] | undefined;
  /** Shared secret for /api/admin; admin routes 503 when unset. */
  adminToken?: string | undefined;
}

export async function buildApp({
  databaseUrl,
  logger = true,
  allowedOrigins,
  adminToken
}: AppOptions) {
  const app = Fastify({
    logger:
      typeof logger === 'object'
        ? { ...logger, redact: { paths: ['req.headers.authorization'], remove: true } }
        : logger,
    // Behind the nginx reverse proxy: resolve the real client IP from X-Forwarded-For
    trustProxy: true
  }).withTypeProvider<TypeBoxTypeProvider>();

  const { db, pool } = createDb(databaseUrl);
  app.decorate('db', db);
  app.decorate('availabilityHub', new AvailabilityHub());
  app.addHook('onClose', async () => {
    await pool.end();
  });

  // Await plugin registration so their hooks exist BEFORE routes are defined —
  // hooks only apply to routes registered after them.
  await app.register(helmet);
  await app.register(cors, { origin: allowedOrigins ?? true });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });
  await app.register(websocket, {
    options: { maxPayload: 1024 }
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
  await adminRoutes(app, adminToken);

  return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
