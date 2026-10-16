import { Type } from 'typebox';
import {
  discountGroszFor,
  hourlyRateGrosz,
  isIsoDate,
  isValidBookingWindow,
  MAX_BOOKING_MINUTES,
  MAX_CLOSE_HOUR,
  MAX_ORDER_ITEM_QUANTITY,
  MAX_SPORT_CARDS_PER_BOOKING,
  MAX_SPOT_ID,
  MIN_BOOKING_MINUTES,
  defaultGameFor,
  rentalGrosz,
  SLOT_MINUTES,
  resolveBookingGame,
  type BilliardGame
} from '@repo/shared';
import { and, desc, eq, gt, gte, ilike, isNotNull, lt } from 'drizzle-orm';
import { blacklist, bookings, orderItems, tables } from '../db/schema.ts';
import {
  ACTIVITY_KIND,
  BILLIARD_GAME,
  BOOKING_RESPONSE,
  BOOKING_STATUS,
  ERROR_RESPONSE,
  INT_ID,
  UUID
} from '../lib/schemas.ts';
import { EXCLUSION_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import { createBooking, NEW_BOOKING_FIELDS } from '../services/create-booking.ts';
import {
  clubDayOf,
  clubDayRange,
  HOUR_MS,
  minutesBetween,
  MINUTE_MS,
  warsawInstantAt
} from '../lib/time.ts';
import { normalizePhone } from '@repo/shared/phone';
import {
  insertOrderItems,
  mustLoadBookingDto,
  phaseOf,
  toBookingDtos
} from '../services/bookings.ts';
import { isClosedFor } from '../services/closures.ts';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

const BOOKING_ID_PARAMS = Type.Object({ id: UUID });

/** Either the booking is open for edits, or it is not and the reason maps to a code. */
type OpenBookingLookup =
  | { error: string; status: number; booking?: undefined }
  | { error?: undefined; booking: typeof bookings.$inferSelect };

/**
 * Bookings at the desk: the list, walk-in bookings, cancel/restore, corrections and the food order.
 * Registered inside the admin scope (routes/admin.ts), behind its token hook.
 */
/** The bell looks back a day; older news is in the bookings list. */
const ONLINE_LOOKBACK_MS = 24 * HOUR_MS;
const ONLINE_LIMIT = 50;

const ONLINE_BOOKING_RESPONSE = Type.Object({
  id: Type.String(),
  kind: ACTIVITY_KIND,
  game: Type.Union([BILLIARD_GAME, Type.Null()]),
  tableLabel: Type.String(),
  customerName: Type.String(),
  customerPhone: Type.String(),
  startsAt: Type.String(),
  endsAt: Type.String(),
  status: BOOKING_STATUS,
  createdAt: Type.String()
});

export const adminBookingRoutes: FastifyPluginAsyncTypebox = async admin => {
  admin.get(
    '/api/admin/bookings',
    {
      schema: {
        querystring: Type.Object({
          date: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
          status: Type.Optional(
            Type.Union([
              Type.Literal('confirmed'),
              Type.Literal('cancelled'),
              Type.Literal('no_show')
            ])
          ),
          phone: Type.Optional(Type.String({ maxLength: 25 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 }))
        }),
        response: { 200: Type.Array(BOOKING_RESPONSE), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { date, status, phone, limit = 100 } = request.query;

      const filters = [];
      if (date !== undefined) {
        if (!isIsoDate(date)) return reply.code(400).send({ error: 'invalid_date' });
        // The club's day: a late night's small hours are listed under its evening
        const [dayStart, dayEnd] = clubDayRange(date, (await admin.venueConfig.get()).hours);
        filters.push(gte(bookings.startsAt, dayStart), lt(bookings.startsAt, dayEnd));
      }
      if (status !== undefined) filters.push(eq(bookings.status, status));
      if (phone !== undefined && phone.trim() !== '') {
        filters.push(ilike(bookings.customerPhone, `%${phone.trim()}%`));
      }

      const rows = await admin.db
        .select()
        .from(bookings)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(date !== undefined ? bookings.startsAt : desc(bookings.startsAt))
        .limit(limit);

      return toBookingDtos(admin.db, rows);
    }
  );

  // The panel's bell: bookings guests made on the site. Only those carry a
  // manage secret — the desk's own bookings never get one — so that is what
  // tells them apart. Polled every half minute by every open panel, hence
  // a narrow window and no order lines.
  admin.get(
    '/api/admin/bookings/online',
    {
      schema: {
        querystring: Type.Object({
          since: Type.Optional(Type.String({ format: 'date-time' }))
        }),
        response: { 200: Type.Array(ONLINE_BOOKING_RESPONSE), '4xx': ERROR_RESPONSE }
      }
    },
    async request => {
      const floor = Date.now() - ONLINE_LOOKBACK_MS;
      const asked = request.query.since === undefined ? floor : Date.parse(request.query.since);
      const since = new Date(Math.max(floor, asked));
      const rows = await admin.db
        .select({
          id: bookings.id,
          kind: tables.kind,
          game: bookings.game,
          tableLabel: tables.label,
          customerName: bookings.customerName,
          customerPhone: bookings.customerPhone,
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
          status: bookings.status,
          createdAt: bookings.createdAt
        })
        .from(bookings)
        .innerJoin(tables, eq(tables.id, bookings.tableId))
        .where(and(isNotNull(bookings.manageTokenHash), gt(bookings.createdAt, since)))
        .orderBy(desc(bookings.createdAt))
        .limit(ONLINE_LIMIT);
      return rows.map(row =>
        Object.assign(row, {
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          createdAt: row.createdAt.toISOString()
        })
      );
    }
  );

  // Reception desk: create a booking on behalf of a walk-in/phone client.
  // Same operating-hours rules as the public flow, but the start may be any
  // hour of the current day (logging a game that already started is fine).
  admin.post(
    '/api/admin/bookings',
    {
      schema: {
        body: Type.Object(NEW_BOOKING_FIELDS, { additionalProperties: false }),
        response: { 201: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const result = await createBooking(admin, request.body, { kind: 'staff' });
      if (!result.ok) return reply.code(result.status).send({ error: result.error });
      return reply.code(201).send(result.booking);
    }
  );

  // Staff cancel: allowed for upcoming AND active bookings
  admin.post(
    '/api/admin/bookings/:id/cancel',
    {
      schema: {
        params: BOOKING_ID_PARAMS,
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const [booking] = await admin.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.params.id));
      if (!booking) return reply.code(404).send({ error: 'not_found' });
      const phase = phaseOf(booking.status, booking.startsAt, booking.endsAt, new Date());
      if (phase !== 'upcoming' && phase !== 'active') {
        return reply.code(409).send({ error: `booking_${phase}` });
      }
      await admin.db
        .update(bookings)
        .set({ status: 'cancelled' })
        .where(eq(bookings.id, booking.id));
      admin.availabilityHub.notify(
        clubDayOf(booking.startsAt, (await admin.venueConfig.get()).hours).date
      );
      return mustLoadBookingDto(admin.db, booking.id);
    }
  );

  /**
   * The client booked and never came. Only once the start has passed (before
   * that it is merely a late arrival). The booking stops holding its slot, so
   * a walk-in can take the table, and the number goes on the black list; an
   * entry already there is kept as it is. Undone by restoring the booking to
   * confirmed (PATCH below), which also removes the entry this created.
   */
  admin.post(
    '/api/admin/bookings/:id/no-show',
    {
      schema: {
        params: BOOKING_ID_PARAMS,
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const [booking] = await admin.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.params.id));
      if (!booking) return reply.code(404).send({ error: 'not_found' });
      if (booking.status !== 'confirmed') {
        return reply.code(409).send({ error: `booking_${booking.status}` });
      }
      if (booking.startsAt.getTime() > Date.now()) {
        return reply.code(409).send({ error: 'booking_not_started' });
      }
      await admin.db.transaction(async tx => {
        await tx.update(bookings).set({ status: 'no_show' }).where(eq(bookings.id, booking.id));
        await tx
          .insert(blacklist)
          .values({ phone: booking.customerPhone, reason: 'no_show', bookingId: booking.id })
          .onConflictDoNothing();
      });
      admin.availabilityHub.notify(
        clubDayOf(booking.startsAt, (await admin.venueConfig.get()).hours).date
      );
      return mustLoadBookingDto(admin.db, booking.id);
    }
  );

  /**
   * Edit an existing booking. The club takes bookings by phone and messenger,
   * so "move me to 20:00" and "different table" arrive constantly — without
   * this, staff had to cancel and re-create, losing the order and the record.
   *
   * Deliberately no start-in-past guard (unlike create): this is also how a
   * mis-logged walk-in from earlier today gets corrected.
   */
  admin.patch(
    '/api/admin/bookings/:id',
    {
      schema: {
        params: BOOKING_ID_PARAMS,
        body: Type.Object(
          {
            tableId: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_SPOT_ID })),
            date: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
            startMinute: Type.Optional(
              Type.Integer({
                minimum: 0,
                maximum: MAX_CLOSE_HOUR * 60 - SLOT_MINUTES,
                multipleOf: SLOT_MINUTES
              })
            ),
            durationMinutes: Type.Optional(
              Type.Integer({
                minimum: MIN_BOOKING_MINUTES,
                maximum: MAX_BOOKING_MINUTES,
                multipleOf: SLOT_MINUTES
              })
            ),
            customerName: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            customerPhone: Type.Optional(Type.String({ minLength: 5, maxLength: 25 })),
            sportCardCount: Type.Optional(
              Type.Integer({ minimum: 0, maximum: MAX_SPORT_CARDS_PER_BOOKING })
            ),
            game: Type.Optional(BILLIARD_GAME),
            /** Restores a cancelled booking, or cancels one, in the same call */
            status: Type.Optional(
              Type.Union([Type.Literal('confirmed'), Type.Literal('cancelled')])
            )
          },
          { additionalProperties: false }
        ),
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const patch = request.body;
      if (Object.keys(patch).length === 0) return reply.code(400).send({ error: 'empty_patch' });
      if (patch.customerName !== undefined && patch.customerName.trim() === '') {
        return reply.code(422).send({ error: 'invalid_name' });
      }

      const [booking] = await admin.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.params.id));
      if (!booking) return reply.code(404).send({ error: 'not_found' });

      const { rates, hours } = await admin.venueConfig.get();
      // Read on the club's day, so a 00:30 on a late night stays the evening's
      const previous = clubDayOf(booking.startsAt, hours);
      const previousDate = previous.date;
      // Any one of the three may move; the other two hold their current value,
      // so "just make it two hours" needs no date or start from the caller.
      const date = patch.date ?? previousDate;
      if (!isIsoDate(date)) return reply.code(400).send({ error: 'invalid_date' });
      const startMinute = patch.startMinute ?? previous.minute;
      const durationMinutes =
        patch.durationMinutes ?? minutesBetween(booking.startsAt, booking.endsAt);
      // Only a change to when the booking runs is judged against today's
      // hours: correcting a name or phone on a booking that no longer fits
      // since staff moved closing time must still go through
      const timeChanged =
        patch.date !== undefined ||
        patch.startMinute !== undefined ||
        patch.durationMinutes !== undefined;
      if (timeChanged && !isValidBookingWindow(date, startMinute, durationMinutes, hours)) {
        return reply.code(422).send({ error: 'outside_operating_hours' });
      }

      const customerPhone =
        patch.customerPhone === undefined ? undefined : normalizePhone(patch.customerPhone);
      if (customerPhone === null) return reply.code(422).send({ error: 'invalid_phone' });

      const tableId = patch.tableId ?? booking.tableId;
      const [spot] = await admin.db.select().from(tables).where(eq(tables.id, tableId));
      if (!spot) return reply.code(422).send({ error: 'unknown_table' });

      // An explicitly requested game must fit the (possibly new) spot.
      let game: BilliardGame | null;
      if (patch.game !== undefined) {
        const requested = resolveBookingGame(tableId, patch.game);
        if (!requested.ok) return reply.code(422).send({ error: 'game_not_available' });
        game = requested.game;
      } else {
        // Otherwise the stored game rides along — unless the move lands on a
        // table that cannot host it, where the table decides. Staff moving a
        // pool game onto a 12ft table have already made their call; failing
        // the whole edit over a detail they did not mention would be worse.
        const carried = resolveBookingGame(tableId, booking.game ?? undefined);
        game = carried.ok ? carried.game : defaultGameFor(tableId);
      }

      // Moving to a different spot means a different tier, so the rental is
      // re-quoted at today's rate. Staying put keeps the locked rate: making a
      // booking longer must not silently reprice it at a newer one.
      const hourlyRate =
        tableId === booking.tableId ? booking.hourlyRateGrosz : hourlyRateGrosz(spot, rates);

      // Cards and duration both feed the cap, so the discount is recomputed
      // whenever either could have moved — same rule as extend.
      const sportCardCount = patch.sportCardCount ?? booking.sportCardCount;
      const startsAt = warsawInstantAt(date, startMinute);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * MINUTE_MS);
      const discountGrosz = discountGroszFor(
        sportCardCount,
        rentalGrosz(hourlyRate, durationMinutes)
      );

      // Moving it, or bringing it back, must not land it in a closed time;
      // a new name or phone on it is not judged at all
      const recheckClosures =
        timeChanged ||
        tableId !== booking.tableId ||
        (patch.status === 'confirmed' && booking.status !== 'confirmed');
      const finalStatus = patch.status ?? booking.status;

      try {
        const closed = await admin.db.transaction(async tx => {
          if (
            recheckClosures &&
            finalStatus === 'confirmed' &&
            (await isClosedFor(tx, tableId, startsAt, endsAt))
          ) {
            return true;
          }
          await tx
            .update(bookings)
            .set({
              tableId,
              game,
              startsAt,
              endsAt,
              sportCardCount,
              hourlyRateGrosz: hourlyRate,
              discountGrosz,
              ...(patch.customerName !== undefined
                ? { customerName: patch.customerName.trim() }
                : {}),
              ...(customerPhone !== undefined ? { customerPhone } : {}),
              ...(patch.status !== undefined ? { status: patch.status } : {})
            })
            .where(eq(bookings.id, booking.id));
          // "Came after all": a restored no-show takes its black-list entry
          // with it (only the one it created; an older entry stays)
          if (booking.status === 'no_show' && patch.status === 'confirmed') {
            await tx.delete(blacklist).where(eq(blacklist.bookingId, booking.id));
          }
          return false;
        });
        if (closed) return reply.code(409).send({ error: 'slot_closed' });
      } catch (err) {
        // The EXCLUDE guard covers updates too: moving onto a taken slot, or
        // un-cancelling into one, lands here rather than double-booking.
        if (pgErrorCode(err) === EXCLUSION_VIOLATION) {
          return reply.code(409).send({ error: 'slot_taken' });
        }
        throw err;
      }

      // Both grids are now stale when the booking changed day
      admin.availabilityHub.notify(date);
      if (previousDate !== date) admin.availabilityHub.notify(previousDate);
      return mustLoadBookingDto(admin.db, booking.id);
    }
  );

  /* Order lines. Staff take food orders at the table and over the phone, so
   * they need the same reach the guest has plus the two things the guest
   * never gets: fixing a quantity and striking a line. Unlike the public
   * endpoint these also work on a finished booking — that is when a tab is
   * settled — but never on a cancelled one. */
  const loadOpenBooking = async (id: string): Promise<OpenBookingLookup> => {
    const [booking] = await admin.db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking) return { error: 'not_found', status: 404 };
    if (booking.status !== 'confirmed') {
      return { error: `booking_${booking.status}`, status: 409 };
    }
    return { booking };
  };

  admin.post(
    '/api/admin/bookings/:id/items',
    {
      schema: {
        params: BOOKING_ID_PARAMS,
        body: Type.Object(
          {
            items: Type.Array(
              Type.Object(
                {
                  foodItemId: INT_ID,
                  quantity: Type.Integer({ minimum: 1, maximum: MAX_ORDER_ITEM_QUANTITY })
                },
                { additionalProperties: false }
              ),
              { minItems: 1, maxItems: 50 }
            )
          },
          { additionalProperties: false }
        ),
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const found = await loadOpenBooking(request.params.id);
      if (found.error !== undefined) {
        return reply.code(found.status).send({ error: found.error });
      }

      const itemError = await insertOrderItems(admin.db, found.booking.id, request.body.items);
      if (itemError) return reply.code(422).send({ error: itemError });
      return mustLoadBookingDto(admin.db, found.booking.id);
    }
  );

  admin.patch(
    '/api/admin/bookings/:id/items/:itemId',
    {
      schema: {
        params: Type.Object({
          id: UUID,
          itemId: UUID
        }),
        body: Type.Object(
          { quantity: Type.Integer({ minimum: 1, maximum: MAX_ORDER_ITEM_QUANTITY }) },
          { additionalProperties: false }
        ),
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const found = await loadOpenBooking(request.params.id);
      if (found.error !== undefined) {
        return reply.code(found.status).send({ error: found.error });
      }

      // unit_price_grosz is untouched on purpose: a line keeps the price it
      // was sold at, however the quantity is corrected afterwards.
      const [updated] = await admin.db
        .update(orderItems)
        .set({ quantity: request.body.quantity })
        .where(
          and(eq(orderItems.id, request.params.itemId), eq(orderItems.bookingId, found.booking.id))
        )
        .returning({ id: orderItems.id });
      if (!updated) return reply.code(404).send({ error: 'not_found' });
      return mustLoadBookingDto(admin.db, found.booking.id);
    }
  );

  admin.delete(
    '/api/admin/bookings/:id/items/:itemId',
    {
      schema: {
        params: Type.Object({
          id: UUID,
          itemId: UUID
        }),
        response: { 200: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const found = await loadOpenBooking(request.params.id);
      if (found.error !== undefined) {
        return reply.code(found.status).send({ error: found.error });
      }

      const [deleted] = await admin.db
        .delete(orderItems)
        .where(
          and(eq(orderItems.id, request.params.itemId), eq(orderItems.bookingId, found.booking.id))
        )
        .returning({ id: orderItems.id });
      if (!deleted) return reply.code(404).send({ error: 'not_found' });
      return mustLoadBookingDto(admin.db, found.booking.id);
    }
  );
};
