import assert from 'node:assert';
import { Type } from 'typebox';
import {
  discountGroszFor,
  hoursForDate,
  MAX_BOOKING_HOURS,
  MAX_ORDER_ITEM_QUANTITY,
  MIN_BOOKING_HOURS
} from '@repo/shared';
import { normalizePhone } from '@repo/shared/phone';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { bookings, tables } from '../db/schema.ts';
import { EXCLUSION_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import {
  BOOKING_RESPONSE,
  BOOKING_SUMMARY_RESPONSE,
  CREATED_BOOKING_RESPONSE,
  ERROR_RESPONSE,
  INT_ID,
  UUID
} from '../lib/schemas.ts';
import { HOUR_MS, warsawDateOf, warsawInstant } from '../lib/time.ts';
import { createBooking, NEW_BOOKING_FIELDS } from '../services/create-booking.ts';
import {
  insertOrderItems,
  loadBookingDto,
  manageTokenMatches,
  mustLoadBookingDto,
  phaseOf,
  toBookingDtos
} from '../services/bookings.ts';
import type { FastifyRequest } from 'fastify';
import type { AppInstance } from '../app.ts';

/** Header carrying the secret returned when the booking was made. */
const MANAGE_TOKEN_HEADER = 'x-booking-token';

const BOOKING_ID_PARAM = Type.Object({ id: UUID });

const NEW_ITEMS = Type.Array(
  Type.Object(
    {
      foodItemId: INT_ID,
      quantity: Type.Integer({ minimum: 1, maximum: MAX_ORDER_ITEM_QUANTITY })
    },
    { additionalProperties: false }
  ),
  { maxItems: 50 }
);

const CREATE_BOOKING_BODY = Type.Object(
  { ...NEW_BOOKING_FIELDS, items: Type.Optional(NEW_ITEMS) },
  { additionalProperties: false }
);

export function bookingRoutes(
  app: AppInstance,
  { createLimitPerHour }: { createLimitPerHour: number }
) {
  /**
   * The booking, if this request may manage it: it presents the booking's
   * secret, or comes from the signed-in account that made it. Rows from
   * before secrets existed (no hash) stay reachable by id until they are over.
   * Anything else reads as "not found" — no hint that the id exists.
   */
  async function loadManagedBooking(request: FastifyRequest<{ Params: { id: string } }>) {
    const [booking] = await app.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, request.params.id));
    if (!booking) return null;
    if (booking.manageTokenHash === null) return booking;
    const presented = request.headers[MANAGE_TOKEN_HEADER];
    if (typeof presented === 'string' && manageTokenMatches(presented, booking.manageTokenHash)) {
      return booking;
    }
    if (booking.userId !== null) {
      const user = await app.authenticatedUser(request);
      if (user?.id === booking.userId) return booking;
    }
    return null;
  }

  app.post(
    '/api/bookings',
    {
      // Anonymous and unverified, so the abuse limits live here: per IP (this),
      // per phone (in the transaction) and how far ahead (below)
      config: { rateLimit: { max: createLimitPerHour, timeWindow: '1 hour' } },
      schema: {
        body: CREATE_BOOKING_BODY,
        response: { 201: CREATED_BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      // Optional sign-in: guests book exactly the same way, discounts included
      const user = await app.authenticatedUser(request);
      const result = await createBooking(app, request.body, {
        kind: 'guest',
        userId: user?.id ?? null
      });
      if (!result.ok) return reply.code(result.status).send({ error: result.error });
      assert(result.manageToken !== null, 'guest bookings carry a manage secret');
      // The only time the secret leaves the server
      return reply.code(201).send({ ...result.booking, manageToken: result.manageToken });
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
        response: { 200: Type.Array(BOOKING_SUMMARY_RESPONSE), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const phone = normalizePhone(request.query.phone);
      if (phone === null) return reply.code(422).send({ error: 'invalid_phone' });

      // Only bookings the guest can still use; finished history stays private.
      // Summaries only: anyone can type a number, so this must reveal neither
      // who booked nor anything that lets the caller manage the booking.
      const now = new Date();
      const rows = await app.db
        .select({
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
          status: bookings.status,
          tableId: bookings.tableId,
          kind: tables.kind,
          tableLabel: tables.label
        })
        .from(bookings)
        .innerJoin(tables, eq(bookings.tableId, tables.id))
        .where(
          and(
            eq(bookings.customerPhone, phone),
            eq(bookings.status, 'confirmed'),
            gt(bookings.endsAt, now)
          )
        )
        .orderBy(asc(bookings.startsAt))
        .limit(20);
      return rows.map(row => ({
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        tableId: row.tableId,
        kind: row.kind,
        tableLabel: row.tableLabel,
        phase: phaseOf(row.status, row.startsAt, row.endsAt, now)
      }));
    }
  );

  app.get(
    '/api/bookings/mine',
    { schema: { response: { 200: Type.Array(BOOKING_RESPONSE), '4xx': ERROR_RESPONSE } } },
    async (request, reply) => {
      // A signed-in guest manages the bookings their account made from any device
      const user = await app.authenticatedUser(request);
      if (!user) return reply.code(401).send({ error: 'unauthorized' });
      const rows = await app.db
        .select()
        .from(bookings)
        .where(eq(bookings.userId, user.id))
        .orderBy(desc(bookings.startsAt))
        .limit(20);
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
      const booking = await loadManagedBooking(request);
      const dto = booking && (await loadBookingDto(app.db, booking.id));
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
      const booking = await loadManagedBooking(request);
      if (!booking) return reply.code(404).send({ error: 'not_found' });

      const now = new Date();
      const phase = phaseOf(booking.status, booking.startsAt, booking.endsAt, now);
      if (phase === 'cancelled' || phase === 'finished') {
        return reply.code(409).send({ error: `booking_${phase}` });
      }

      const newEndsAt = new Date(booking.endsAt.getTime() + request.body.additionalHours * HOUR_MS);
      // Extending is still one booking: the same ceiling as creating one
      if (newEndsAt.getTime() - booking.startsAt.getTime() > MAX_BOOKING_HOURS * HOUR_MS) {
        return reply.code(422).send({ error: 'booking_too_long' });
      }
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
      const booking = await loadManagedBooking(request);
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
      const booking = await loadManagedBooking(request);
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
