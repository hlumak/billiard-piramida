import assert from 'node:assert';
import { Type } from '@sinclair/typebox';
import {
  discountGroszFor,
  HOURLY_RATE_GROSZ,
  hoursForDate,
  isIsoDate,
  isValidBookingWindow,
  TABLES_COUNT
} from '@repo/shared';
import { normalizePhone } from '@repo/shared/phone';
import { and, asc, eq, gt } from 'drizzle-orm';
import { bookings, users } from '../db/schema.ts';
import { EXCLUSION_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import { BOOKING_RESPONSE, ERROR_RESPONSE } from '../lib/schemas.ts';
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
      quantity: Type.Integer({ minimum: 1, maximum: 50 })
    },
    { additionalProperties: false }
  ),
  { maxItems: 50 }
);

const CREATE_BOOKING_BODY = Type.Object(
  {
    tableId: Type.Integer({ minimum: 1, maximum: TABLES_COUNT }),
    date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    startHour: Type.Integer({ minimum: 0, maximum: 23 }),
    durationHours: Type.Integer({ minimum: 1, maximum: 8 }),
    customerName: Type.String({ minLength: 1, maxLength: 120 }),
    customerPhone: Type.String({ minLength: 5, maxLength: 25 }),
    items: Type.Optional(NEW_ITEMS)
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

      if (!isIsoDate(date)) {
        return reply.code(400).send({ error: 'invalid_date' });
      }
      const customerPhone = normalizePhone(request.body.customerPhone);
      if (customerPhone === null) {
        return reply.code(422).send({ error: 'invalid_phone' });
      }
      if (!isValidBookingWindow(date, startHour, durationHours)) {
        return reply.code(422).send({ error: 'outside_operating_hours' });
      }

      const startsAt = warsawInstant(date, startHour);
      const endsAt = new Date(startsAt.getTime() + durationHours * HOUR_MS);
      if (startsAt.getTime() < Date.now() - START_GRACE_MS) {
        return reply.code(422).send({ error: 'start_in_past' });
      }

      // Optional sign-in: guests book exactly the same way, just without discounts
      const user = await app.authenticatedUser(request);
      const discountGrosz = user ? discountGroszFor(user, durationHours * HOURLY_RATE_GROSZ) : 0;

      try {
        const bookingId = await app.db.transaction(async tx => {
          const [created] = await tx
            .insert(bookings)
            .values({
              tableId,
              customerName,
              customerPhone,
              startsAt,
              endsAt,
              userId: user?.id ?? null,
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
          { additionalHours: Type.Integer({ minimum: 1, maximum: 8 }) },
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
      const closesAt = warsawInstant(bookingDate, hoursForDate(bookingDate).close);
      if (newEndsAt.getTime() > closesAt.getTime()) {
        return reply.code(422).send({ error: 'past_closing_time' });
      }

      // Discount is a fraction of table rental, so a longer rental changes it —
      // recompute for signed-in bookings (guests always have discount 0).
      let discountGrosz = booking.discountGrosz;
      if (booking.userId !== null) {
        const [user] = await app.db.select().from(users).where(eq(users.id, booking.userId));
        if (user) {
          const newDurationHours = Math.round(
            (newEndsAt.getTime() - booking.startsAt.getTime()) / HOUR_MS
          );
          discountGrosz = discountGroszFor(user, newDurationHours * HOURLY_RATE_GROSZ);
        }
      }

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
