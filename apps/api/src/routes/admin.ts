import { Type } from 'typebox';
import { ERROR_RESPONSE } from '../lib/schemas.ts';
import { ADMIN_TOKEN_COOKIE, clearAdminCookies, setAdminCookies } from '../lib/cookies.ts';
import {
  adminSessionNeedsRenewal,
  issueAdminSession,
  secretsMatch,
  verifyAdminSession
} from '../lib/admin-session.ts';
import { FailureLimiter } from '../lib/failure-limiter.ts';
import { adminImageRoutes } from './admin-images.ts';
import { adminBlacklistRoutes } from './admin-blacklist.ts';
import { adminBookingRoutes } from './admin-bookings.ts';
import { adminClosureRoutes } from './admin-closures.ts';
import { adminCustomerRoutes } from './admin-customers.ts';
import { adminMenuRoutes } from './admin-menu.ts';
import { adminNewsRoutes } from './admin-news.ts';
import { adminStatsRoutes } from './admin-stats.ts';
import { adminTournamentRoutes } from './admin-tournaments.ts';
import { adminVenueConfigRoutes } from './admin-venue-config.ts';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { AppInstance } from '../app.ts';

/** Wrong admin credentials per IP before /api/admin answers 429 for a while. */
const ADMIN_FAILURES_PER_WINDOW = 10;
const ADMIN_FAILURE_WINDOW_MS = 15 * 60_000;

export async function adminRoutes(app: AppInstance, adminToken: string | undefined) {
  // Shared by the login and the guard: guessing through the x-admin-token
  // header on any admin route used to run at the global 100/min instead of the
  // login's 10/min. Every wrong secret now counts against the IP.
  //
  // Only guesses at the secret itself are counted and blocked. A session
  // cookie is checked first and is never held back: the desk shares the club
  // Wi-Fi with guests, and ten junk requests from one phone used to lock every
  // signed-in member of staff out for the window. Nor is a dead cookie a
  // guess — it is signed, so there is nothing to find by trying — and counting
  // those locked the desk out of signing in right after the key was rotated.
  const failures = new FailureLimiter(ADMIN_FAILURES_PER_WINDOW, ADMIN_FAILURE_WINDOW_MS);

  // Session endpoints live OUTSIDE the guarded scope so they manage their own auth:
  // login validates the token and sets the HttpOnly cookie; logout just clears it.
  app.post(
    '/api/admin/session',
    {
      // Throttle brute-force on the shared admin secret
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: Type.Object(
          { token: Type.String({ minLength: 1 }) },
          { additionalProperties: false }
        ),
        response: { 200: Type.Object({ ok: Type.Boolean() }), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      if (!adminToken) return reply.code(503).send({ error: 'admin_disabled' });
      if (failures.isBlocked(request.ip)) return reply.code(429).send({ error: 'rate_limited' });
      if (!secretsMatch(request.body.token, adminToken)) {
        failures.fail(request.ip);
        return reply.code(401).send({ error: 'unauthorized' });
      }
      setAdminCookies(reply, issueAdminSession(adminToken), app.cookieSecure);
      return { ok: true };
    }
  );

  app.post(
    '/api/admin/logout',
    { schema: { response: { 200: Type.Object({ ok: Type.Boolean() }) } } },
    async (_request, reply) => {
      clearAdminCookies(reply, app.cookieSecure);
      return { ok: true };
    }
  );

  await app.register(async scope => {
    // Encapsulated scope: the auth hook applies to /api/admin routes only
    const admin = scope.withTypeProvider<TypeBoxTypeProvider>();

    admin.addHook('onRequest', async (request, reply) => {
      if (!adminToken) {
        return reply.code(503).send({ error: 'admin_disabled' });
      }
      // Browsers carry a signed, expiring session cookie; API clients (and the
      // tests) may send the secret itself in the x-admin-token header.
      const header = request.headers['x-admin-token'];
      const session = request.cookies[ADMIN_TOKEN_COOKIE];
      if (typeof header === 'string') {
        if (failures.isBlocked(request.ip)) {
          return reply.code(429).send({ error: 'rate_limited' });
        }
        if (!secretsMatch(header, adminToken)) {
          failures.fail(request.ip);
          return reply.code(401).send({ error: 'unauthorized' });
        }
      } else if (typeof session !== 'string' || !verifyAdminSession(adminToken, session)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      // Sliding expiry: a device in use never reaches the 30-day limit
      if (
        typeof header !== 'string' &&
        typeof session === 'string' &&
        adminSessionNeedsRenewal(session)
      ) {
        setAdminCookies(reply, issueAdminSession(adminToken), app.cookieSecure);
      }
    });

    // Each area is its own plugin, registered inside this scope so it inherits
    // the token hook above — which is the whole point of the scope. This file
    // is only the session endpoints and that guard.
    await admin.register(adminBookingRoutes);
    await admin.register(adminCustomerRoutes);
    await admin.register(adminBlacklistRoutes);
    await admin.register(adminStatsRoutes);
    await admin.register(adminMenuRoutes);
    await admin.register(adminNewsRoutes);
    await admin.register(adminTournamentRoutes);
    await admin.register(adminVenueConfigRoutes);
    await admin.register(adminClosureRoutes);
    await admin.register(adminImageRoutes);
  });
}
