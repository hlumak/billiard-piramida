import assert from 'node:assert';
import { Type } from '@sinclair/typebox';
import {
  discountGroszFor,
  hoursForDate,
  isIsoDate,
  isValidBookingWindow,
  MAX_BOOKING_HOURS,
  MAX_ORDER_ITEM_QUANTITY,
  MAX_SPORT_CARDS_PER_BOOKING,
  MIN_BOOKING_HOURS,
  hourlyRateGrosz,
  MAX_SPOT_ID,
  resolveBookingGame
} from '@repo/shared';
import { normalizePhone } from '@repo/shared/phone';
import { and, asc, eq, gt } from 'drizzle-orm';
import { bookings, tables } from '../db/schema.ts';
import { EXCLUSION_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import { BILLIARD_GAME, BOOKING_RESPONSE, ERROR_RESPONSE } from '../lib/schemas.ts';
import { HOUR_MS, warsawDateOf, warsawInstant } from '../lib/time.ts';
import {
  insertOrderItems,
  loadBookingDto,
  mustLoadBookingDto,
  phaseOf,
  toBookingDtos
} from '../services/bookings.ts';
import type { AppInstance } from '../app.ts';

// Strict UUID shape: a loose 36-char pattern lets malformed ids reach Postgres
// as a uuid cast and surface as a logged 500 (22P02) instead of a clean 404.
const BOOKING_ID_PARAM = Type.Object({
  id: Type.String({
    pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  })
});

const NEW_ITEMS = Type.Array(
  Type.Object(
    {
      foodItemId: Type.Integer({ minimum: 1 }),
      quantity: Type.Integer({ minimum: 1, maximum: MAX_ORDER_ITEM_QUANTITY })
    },
    { additionalProperties: false }
  ),
  { maxItems: 50 }
);

const CREATE_BOOKING_BODY = Type.Object(
  {
    tableId: Type.Integer({ minimum: 1, maximum: MAX_SPOT_ID }),
    date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    startHour: Type.Integer({ minimum: 0, maximum: 23 }),
    durationHours: Type.Integer({ minimum: MIN_BOOKING_HOURS, maximum: MAX_BOOKING_HOURS }),
    customerName: Type.String({ minLength: 1, maxLength: 120 }),
    customerPhone: Type.String({ minLength: 5, maxLength: 25 }),
    /** Self-declared and open to guests — staff check the cards at reception */
    sportCardCount: Type.Optional(
      Type.Integer({ minimum: 0, maximum: MAX_SPORT_CARDS_PER_BOOKING })
    ),
    items: Type.Optional(NEW_ITEMS),
    /** Billiard only. Omitted, the spot's first offered game is stored. */
    game: Type.Optional(BILLIARD_GAME)
  },
  { additionalProperties: false }
);

/** Allow bookings that start at most 5 minutes ago ("book the table right now"). */
const START_GRACE_MS = 5 * 60_000;

export function bookingRoutes(app: AppInstance) {
  app.post(
    '/api/bookings',
    {
      schema: {
        body: CREATE_BOOKING_BODY,
        response: { 201: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { tableId, date, startHour, durationHours, customerName } = request.body;
      const items = request.body.items ?? [];
      const sportCardCount = request.body.sportCardCount ?? 0;

      if (!isIsoDate(date)) {
        return reply.code(400).send({ error: 'invalid_date' });
      }
      const customerPhone = normalizePhone(request.body.customerPhone);
      if (customerPhone === null) {
        return reply.code(422).send({ error: 'invalid_phone' });
      }
      const { rates, hours } = await app.venueConfig.get();
      if (!isValidBookingWindow(date, startHour, durationHours, hours)) {
        return reply.code(422).send({ error: 'outside_operating_hours' });
      }

      const startsAt = warsawInstant(date, startHour);
      const endsAt = new Date(startsAt.getTime() + durationHours * HOUR_MS);
      if (startsAt.getTime() < Date.now() - START_GRACE_MS) {
        return reply.code(422).send({ error: 'start_in_past' });
      }

      // The rate follows the spot, so an unknown id must fail before pricing
      const [spot] = await app.db.select().from(tables).where(eq(tables.id, tableId));
      if (!spot) return reply.code(422).send({ error: 'unknown_table' });

      // Pool on a 12ft table, or any game on a dartboard, is not a thing the
      // room can serve — reject rather than quietly storing something else.
      const game = resolveBookingGame(tableId, request.body.game);
      if (!game.ok) return reply.code(422).send({ error: 'game_not_available' });

      // Optional sign-in: guests book exactly the same way, discounts included —
      // the cards belong to the players at the spot, not to an account
      const user = await app.authenticatedUser(request);
      // Locked onto the row: a later reprice must not rewrite this receipt
      const hourlyRateGroszNow = hourlyRateGrosz(spot, rates);
      const discountGrosz = discountGroszFor(sportCardCount, hourlyRateGroszNow * durationHours);

      try {
        const bookingId = await app.db.transaction(async tx => {
          const [created] = await tx
            .insert(bookings)
            .values({
              tableId,
              game: game.game,
              customerName,
              customerPhone,
              startsAt,
              endsAt,
              userId: user?.id ?? null,
              sportCardCount,
              hourlyRateGrosz: hourlyRateGroszNow,
              discountGrosz
            })
            .returning({ id: bookings.id });
          assert(created, 'insert returned no row');
          const itemError = await insertOrderItems(tx, created.id, items);
          if (itemError) throw new Error(itemError);
          return created.id;
        });
        const dto = await mustLoadBookingDto(app.db, bookingId);
        app.availabilityHub.notify(date);
        return reply.code(201).send(dto);
      } catch (err) {
        if (pgErrorCode(err) === EXCLUSION_VIOLATION) {
          return reply.code(409).send({ error: 'slot_taken' });
        }
        if (err instanceof Error && err.message === 'unknown_food_item') {
          return reply.code(422).send({ error: 'unknown_food_item' });
        }
        throw err;
      }
    }
  );

  app.get(
    '/api/bookings/lookup',
    {
      // Tighter than the global limit: this endpoint is phone-enumerable
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        querystring: Type.Object(
          { phone: Type.String({ minLength: 5, maxLength: 25 }) },
          { additionalProperties: false }
        ),
        response: { 200: Type.Array(BOOKING_RESPONSE), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const phone = normalizePhone(request.query.phone);
      if (phone === null) return reply.code(422).send({ error: 'invalid_phone' });

      // Only bookings the guest can still use; finished history stays private
      const rows = await app.db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.customerPhone, phone),
            eq(bookings.status, 'confirmed'),
            gt(bookings.endsAt, new Date())
          )
        )
        .orderBy(asc(bookings.startsAt))
        .limit(20);
      // Batch-load order items in one query instead of N+1 per booking
      return toBookingDtos(app.db, rows);
    }
  );

  app.get(
    '/api/bookings/:id',
    {
      schema: {
        params: BOOKING_ID_PARAM,
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const dto = await loadBookingDto(app.db, request.params.id);
      if (!dto) return reply.code(404).send({ error: 'not_found' });
      return dto;
    }
  );

  app.post(
    '/api/bookings/:id/extend',
    {
      schema: {
        params: BOOKING_ID_PARAM,
        body: Type.Object(
          {
            additionalHours: Type.Integer({
              minimum: MIN_BOOKING_HOURS,
              maximum: MAX_BOOKING_HOURS
            })
          },
          { additionalProperties: false }
        ),
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const [booking] = await app.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.params.id));
      if (!booking) return reply.code(404).send({ error: 'not_found' });

      const now = new Date();
      const phase = phaseOf(booking.status, booking.startsAt, booking.endsAt, now);
      if (phase === 'cancelled' || phase === 'finished') {
        return reply.code(409).send({ error: `booking_${phase}` });
      }

      const newEndsAt = new Date(booking.endsAt.getTime() + request.body.additionalHours * HOUR_MS);
      const bookingDate = warsawDateOf(booking.startsAt);
      const { hours } = await app.venueConfig.get();
      const closesAt = warsawInstant(bookingDate, hoursForDate(bookingDate, hours).close);
      if (newEndsAt.getTime() > closesAt.getTime()) {
        return reply.code(422).send({ error: 'past_closing_time' });
      }

      // The discount is capped by the rental, so a longer rental can uncap it
      // (three cards on one darts hour were clipped to 30 zł; at two hours the
      // full 45 zł applies) — recompute against the new duration, at the rate
      // this booking was written at rather than today's.
      const newDurationHours = Math.round(
        (newEndsAt.getTime() - booking.startsAt.getTime()) / HOUR_MS
      );
      const discountGrosz = discountGroszFor(
        booking.sportCardCount,
        booking.hourlyRateGrosz * newDurationHours
      );

      try {
        await app.db
          .update(bookings)
          .set({ endsAt: newEndsAt, discountGrosz })
          .where(eq(bookings.id, booking.id));
      } catch (err) {
        if (pgErrorCode(err) === EXCLUSION_VIOLATION) {
          return reply.code(409).send({ error: 'slot_taken' });
        }
        throw err;
      }
      app.availabilityHub.notify(bookingDate);
      return mustLoadBookingDto(app.db, booking.id);
    }
  );

  app.post(
    '/api/bookings/:id/items',
    {
      schema: {
        params: BOOKING_ID_PARAM,
        body: Type.Object({ items: NEW_ITEMS }, { additionalProperties: false }),
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      if (request.body.items.length === 0) {
        return reply.code(400).send({ error: 'empty_items' });
      }
      const [booking] = await app.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.params.id));
      if (!booking) return reply.code(404).send({ error: 'not_found' });

      const phase = phaseOf(booking.status, booking.startsAt, booking.endsAt, new Date());
      if (phase === 'cancelled' || phase === 'finished') {
        return reply.code(409).send({ error: `booking_${phase}` });
      }

      const itemError = await insertOrderItems(app.db, booking.id, request.body.items);
      if (itemError) return reply.code(422).send({ error: itemError });
      return mustLoadBookingDto(app.db, booking.id);
    }
  );

  app.post(
    '/api/bookings/:id/cancel',
    {
      schema: {
        params: BOOKING_ID_PARAM,
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const [booking] = await app.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.params.id));
      if (!booking) return reply.code(404).send({ error: 'not_found' });

      const phase = phaseOf(booking.status, booking.startsAt, booking.endsAt, new Date());
      if (phase !== 'upcoming') {
        return reply.code(409).send({ error: 'only_upcoming_can_be_cancelled' });
      }

      await app.db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, booking.id));
      app.availabilityHub.notify(warsawDateOf(booking.startsAt));
      return mustLoadBookingDto(app.db, booking.id);
    }
  );
}
