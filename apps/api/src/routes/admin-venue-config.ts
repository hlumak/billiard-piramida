import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { sql } from 'drizzle-orm';
import { venueHours, venueRates } from '../db/schema.ts';
import { ERROR_RESPONSE, RATE_TABLE, VENUE_CONFIG_RESPONSE, WEEKLY_HOURS } from '../lib/schemas.ts';
import { Type } from '@sinclair/typebox';

/**
 * Rates and opening hours, staff side. A whole-config PUT rather than per-field
 * patches: this is one settings form, and replacing the lot keeps the seven
 * weekdays and three tiers consistent with each other in a single transaction.
 */
export const adminVenueConfigRoutes: FastifyPluginAsyncTypebox = async admin => {
  admin.get(
    '/api/admin/venue-config',
    { schema: { response: { 200: VENUE_CONFIG_RESPONSE } } },
    async () => admin.venueConfig.get()
  );

  admin.put(
    '/api/admin/venue-config',
    {
      schema: {
        body: Type.Object(
          { rates: RATE_TABLE, hours: WEEKLY_HOURS },
          { additionalProperties: false }
        ),
        response: { 200: VENUE_CONFIG_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { rates, hours } = request.body;

      // A day that opens after it closes is shut, which is legitimate; one that
      // runs past midnight is not — this app's whole clock is a single day.
      if (hours.some(day => day.open > 24 || day.close > 24)) {
        return reply.code(422).send({ error: 'invalid_hours' });
      }

      // Two statements, not ten: `excluded` is the row Postgres was about to
      // insert, so every tier and every weekday updates to its own new value.
      await admin.db.transaction(async tx => {
        await tx
          .insert(venueRates)
          .values(Object.entries(rates).map(([tier, hourlyGrosz]) => ({ tier, hourlyGrosz })))
          .onConflictDoUpdate({
            target: venueRates.tier,
            set: { hourlyGrosz: sql`excluded.hourly_grosz` }
          });
        await tx
          .insert(venueHours)
          .values(hours.map((day, weekday) => ({ weekday, opens: day.open, closes: day.close })))
          .onConflictDoUpdate({
            target: venueHours.weekday,
            set: { opens: sql`excluded.opens`, closes: sql`excluded.closes` }
          });
      });

      // Drop the cache before answering, so the very next availability request
      // is already validated against what was just saved.
      admin.venueConfig.invalidate();
      return admin.venueConfig.get();
    }
  );
};
