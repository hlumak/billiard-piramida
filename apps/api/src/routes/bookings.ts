import assert from 'node:assert';
import { Type } from '@sinclair/typebox';
import {
  hoursForDate,
  isIsoDate,
  isValidBookingWindow,
  TABLES_COUNT,
  type NewOrderItem
} from '@repo/shared';
import { eq, inArray } from 'drizzle-orm';
import { bookings, foodItems, orderItems } from '../db/schema.ts';
import { EXCLUSION_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import { BOOKING_RESPONSE, ERROR_RESPONSE } from '../lib/schemas.ts';
import { HOUR_MS, warsawDateOf, warsawInstant } from '../lib/time.ts';
import { loadBookingDto, mustLoadBookingDto, phaseOf } from '../services/bookings.ts';
import type { AppInstance } from '../app.ts';

const BOOKING_ID_PARAM = Type.Object({
  id: Type.String({ pattern: '^[0-9a-fA-F-]{36}$' })
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

async function insertOrderItems(
  tx: Pick<AppInstance['db'], 'select' | 'insert'>,
  bookingId: string,
  items: NewOrderItem[]
): Promise<'unknown_food_item' | null> {
  if (items.length === 0) return null;
  const ids = [...new Set(items.map(i => i.foodItemId))];
  const found = await tx
    .select({ id: foodItems.id, priceGrosz: foodItems.priceGrosz })
    .from(foodItems)
    .where(inArray(foodItems.id, ids));
  const priceById = new Map(found.map(f => [f.id, f.priceGrosz]));
  if (ids.some(id => !priceById.has(id))) return 'unknown_food_item';

  await tx.insert(orderItems).values(
    items.map(i => {
      const unitPriceGrosz = priceById.get(i.foodItemId);
      assert(unitPriceGrosz !== undefined);
      return {
        bookingId,
        foodItemId: i.foodItemId,
        quantity: i.quantity,
        unitPriceGrosz
      };
    })
  );
  return null;
}

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
      const { tableId, date, startHour, durationHours, customerName, customerPhone } = request.body;
      const items = request.body.items ?? [];

      if (!isIsoDate(date)) {
        return reply.code(400).send({ error: 'invalid_date' });
      }
      if (!isValidBookingWindow(date, startHour, durationHours)) {
        return reply.code(422).send({ error: 'outside_operating_hours' });
      }

      const startsAt = warsawInstant(date, startHour);
      const endsAt = new Date(startsAt.getTime() + durationHours * HOUR_MS);
      if (startsAt.getTime() < Date.now() - START_GRACE_MS) {
        return reply.code(422).send({ error: 'start_in_past' });
      }

      try {
        const bookingId = await app.db.transaction(async tx => {
          const [created] = await tx
            .insert(bookings)
            .values({ tableId, customerName, customerPhone, startsAt, endsAt })
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

      try {
        await app.db.update(bookings).set({ endsAt: newEndsAt }).where(eq(bookings.id, booking.id));
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
