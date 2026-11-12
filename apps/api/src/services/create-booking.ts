import assert from 'node:assert';
import { Type } from 'typebox';
import {
  addDays,
  BOOKING_DAYS_AHEAD,
  discountGroszFor,
  hourlyRateGrosz,
  isIsoDate,
  isValidBookingWindow,
  MAX_BOOKING_MINUTES,
  MAX_CLOSE_HOUR,
  MAX_ORDER_UNITS_PER_BOOKING,
  MAX_SPORT_CARDS_PER_BOOKING,
  MAX_SPOT_ID,
  MAX_UPCOMING_BOOKINGS_PER_PHONE,
  maxSportCardsOnline,
  MIN_BOOKING_MINUTES,
  rentalGrosz,
  resolveBookingGame,
  SLOT_MINUTES,
  type BilliardGame,
  type BookingDto
} from '@repo/shared';
import { normalizePhone } from '@repo/shared/phone';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import { blacklist, bookings, tables } from '../db/schema.ts';
import { EXCLUSION_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import { BILLIARD_GAME } from '../lib/schemas.ts';
import { clubDayOf, clubDayRange, MINUTE_MS, warsawInstantAt } from '../lib/time.ts';
import { createManageToken, insertOrderItems, mustLoadBookingDto } from './bookings.ts';
import { isClosedFor } from './closures.ts';
import type { FastifyInstance } from 'fastify';

/** Body fields the guest form and the reception desk have in common. */
export const NEW_BOOKING_FIELDS = {
  tableId: Type.Integer({ minimum: 1, maximum: MAX_SPOT_ID }),
  date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  /** Minutes after local midnight — 18:00 or 18:30, never 18:15; past 1440 on a late night */
  startMinute: Type.Integer({
    minimum: 0,
    maximum: MAX_CLOSE_HOUR * 60 - SLOT_MINUTES,
    multipleOf: SLOT_MINUTES
  }),
  /** 60, 90, 120 … — an hour at least, in half-hour steps */
  durationMinutes: Type.Integer({
    minimum: MIN_BOOKING_MINUTES,
    maximum: MAX_BOOKING_MINUTES,
    multipleOf: SLOT_MINUTES
  }),
  customerName: Type.String({ minLength: 1, maxLength: 120 }),
  customerPhone: Type.String({ minLength: 5, maxLength: 25 }),
  /** Self-declared and open to guests — staff check the cards at reception.
   *  Guests get one per full hour on top of this bound (see createBooking). */
  sportCardCount: Type.Optional(Type.Integer({ minimum: 0, maximum: MAX_SPORT_CARDS_PER_BOOKING })),
  /** Billiard only. Omitted, the spot's first offered game is stored. */
  game: Type.Optional(BILLIARD_GAME)
};

/**
 * The desk's body: the same fields, but the name and phone may both be left
 * out for an offline client — someone who walked in to play and whose
 * details nobody needs. One without the other is still refused.
 */
export const STAFF_BOOKING_FIELDS = {
  ...NEW_BOOKING_FIELDS,
  customerName: Type.Optional(NEW_BOOKING_FIELDS.customerName),
  customerPhone: Type.Optional(NEW_BOOKING_FIELDS.customerPhone)
};

export interface NewBooking {
  tableId: number;
  date: string;
  startMinute: number;
  durationMinutes: number;
  /** Both left out: an offline client (staff only) */
  customerName?: string | undefined;
  customerPhone?: string | undefined;
  sportCardCount?: number | undefined;
  game?: BilliardGame | undefined;
  items?: { foodItemId: number; quantity: number }[] | undefined;
}

/**
 * Who is booking, which decides the rules beyond the shared ones:
 * - guest: anonymous and unverified, so the abuse limits apply — at most
 *   BOOKING_DAYS_AHEAD ahead, starting no earlier than a few minutes ago, a
 *   cap on upcoming bookings per phone — and the booking gets a manage secret
 *   (returned once). A signed-in guest's account is recorded on it.
 * - staff: the reception desk logging a walk-in or a phone call; any hour of
 *   today may be entered (a game that already started), no cap, no secret,
 *   and a walk-in may stay an offline client with no name or number.
 */
export type BookingPolicy = { kind: 'guest'; userId: string | null } | { kind: 'staff' };

export type CreateBookingResult =
  | { ok: true; booking: BookingDto; manageToken: string | null }
  | { ok: false; status: 400 | 403 | 409 | 422; error: string };

/** Allow bookings that start at most 5 minutes ago ("book the table right now"). */
export const START_GRACE_MS = 5 * 60_000;

/** Thrown inside the transaction so a refusal rolls the booking back. */
class BookingRefused extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const refuse = (status: 400 | 403 | 409 | 422, error: string): CreateBookingResult => ({
  ok: false,
  status,
  error
});

type Contact =
  | { ok: true; customerName: string; customerPhone: string }
  | { ok: true; customerName: null; customerPhone: null };

/**
 * Who to reach: a trimmed name and a normalized number, or — for the desk
 * only — neither, for an offline client. Half a contact is refused.
 */
function readContact(
  input: NewBooking,
  policy: BookingPolicy
): Contact | Extract<CreateBookingResult, { ok: false }> {
  if (
    policy.kind === 'staff' &&
    input.customerName === undefined &&
    input.customerPhone === undefined
  ) {
    return { ok: true, customerName: null, customerPhone: null };
  }
  const customerName = input.customerName?.trim() ?? '';
  if (customerName === '') return { ok: false, status: 422, error: 'invalid_name' };
  const customerPhone = normalizePhone(input.customerPhone ?? '');
  if (customerPhone === null) return { ok: false, status: 422, error: 'invalid_phone' };
  return { ok: true, customerName, customerPhone };
}

/**
 * One path for every new booking: validation, the locked-in price, the
 * insert (the database's overlap constraint is the final word on the slot)
 * and the live-availability ping.
 */
export async function createBooking(
  app: Pick<FastifyInstance, 'db' | 'venueConfig' | 'availabilityHub'>,
  input: NewBooking,
  policy: BookingPolicy
): Promise<CreateBookingResult> {
  const { tableId, date, startMinute, durationMinutes } = input;
  if (!isIsoDate(date)) return refuse(400, 'invalid_date');
  const contact = readContact(input, policy);
  if (!contact.ok) return contact;
  const { customerName, customerPhone } = contact;
  // Clients who booked and did not come book by phone now; the desk can
  // still book for them
  if (policy.kind === 'guest' && customerPhone !== null) {
    const [blocked] = await app.db
      .select({ phone: blacklist.phone })
      .from(blacklist)
      .where(eq(blacklist.phone, customerPhone));
    if (blocked) return refuse(403, 'phone_blocked');
  }

  const { rates, hours } = await app.venueConfig.get();
  // The club's today: until a late night closes, 00:30 on the calendar is
  // still the evening before
  const today = clubDayOf(new Date(), hours).date;
  // The wizard only offers the next BOOKING_DAYS_AHEAD days; the API holds the
  // same line, or one script could fill the calendar years ahead
  if (policy.kind === 'guest' && date > addDays(today, BOOKING_DAYS_AHEAD - 1)) {
    return refuse(422, 'booking_too_far');
  }
  // Also refuses a start off the half-hour grid or a length under an hour,
  // should a caller get past the schema
  if (!isValidBookingWindow(date, startMinute, durationMinutes, hours)) {
    return refuse(422, 'outside_operating_hours');
  }

  const startsAt = warsawInstantAt(date, startMinute);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * MINUTE_MS);
  const earliestStart =
    policy.kind === 'guest' ? Date.now() - START_GRACE_MS : clubDayRange(today, hours)[0].getTime();
  if (startsAt.getTime() < earliestStart) return refuse(422, 'start_in_past');

  // The rate follows the spot, so an unknown id must fail before pricing
  const [spot] = await app.db.select().from(tables).where(eq(tables.id, tableId));
  if (!spot) return refuse(422, 'unknown_table');

  // Pool on a 12ft table, or any game on a dartboard, is not a thing the room
  // can serve — reject rather than quietly storing something else.
  const game = resolveBookingGame(tableId, input.game);
  if (!game.ok) return refuse(422, 'game_not_available');

  // Discounts apply to guests and staff alike — the cards belong to the
  // players at the spot, not to an account. The rate is locked onto the row:
  // a later reprice must not rewrite this receipt.
  const sportCardCount = input.sportCardCount ?? 0;
  // One card per full hour online; the desk is not held to it, since staff
  // see the cards and settle it at reception
  if (policy.kind === 'guest' && sportCardCount > maxSportCardsOnline(durationMinutes)) {
    return refuse(422, 'too_many_sport_cards');
  }
  const lockedRateGrosz = hourlyRateGrosz(spot, rates);
  const discountGrosz = discountGroszFor(
    sportCardCount,
    rentalGrosz(lockedRateGrosz, durationMinutes)
  );
  const manage = policy.kind === 'guest' ? createManageToken() : null;

  try {
    const booking = await app.db.transaction(async tx => {
      if (policy.kind === 'guest' && customerPhone !== null) {
        // Serialize creations per phone so two parallel requests can't both
        // pass the count below; released at commit/rollback
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${customerPhone}))`);
        const [held] = await tx
          .select({ n: count() })
          .from(bookings)
          .where(
            and(
              eq(bookings.customerPhone, customerPhone),
              eq(bookings.status, 'confirmed'),
              gt(bookings.endsAt, new Date())
            )
          );
        if ((held?.n ?? 0) >= MAX_UPCOMING_BOOKINGS_PER_PHONE) {
          throw new BookingRefused('too_many_bookings');
        }
      }

      // Staff close a time for the desk as much as for the website
      if (await isClosedFor(tx, tableId, startsAt, endsAt)) throw new BookingRefused('slot_closed');

      const [created] = await tx
        .insert(bookings)
        .values({
          tableId,
          game: game.game,
          customerName,
          customerPhone,
          startsAt,
          endsAt,
          userId: policy.kind === 'guest' ? policy.userId : null,
          sportCardCount,
          hourlyRateGrosz: lockedRateGrosz,
          discountGrosz,
          manageTokenHash: manage?.hash ?? null
        })
        .returning({ id: bookings.id });
      assert(created, 'insert returned no row');
      const itemError = await insertOrderItems(
        tx,
        created.id,
        input.items ?? [],
        policy.kind === 'guest' ? { maxUnits: MAX_ORDER_UNITS_PER_BOOKING } : {}
      );
      if (itemError) throw new BookingRefused(itemError);
      // Read back before the commit: were this to fail afterwards, the guest
      // would get a 500 for a booking that exists, and its secret — returned
      // only here — would be lost with the answer
      return mustLoadBookingDto(tx, created.id);
    });
    app.availabilityHub.notify(date);
    return { ok: true, booking, manageToken: manage?.token ?? null };
  } catch (err) {
    if (pgErrorCode(err) === EXCLUSION_VIOLATION) return refuse(409, 'slot_taken');
    if (err instanceof BookingRefused) {
      return err.code === 'unknown_food_item' || err.code === 'too_many_items'
        ? refuse(422, err.code)
        : refuse(409, err.code);
    }
    throw err;
  }
}
