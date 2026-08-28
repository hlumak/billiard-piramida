import assert from 'node:assert';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import {
  discountGroszFor,
  hourlyRateGrosz,
  hoursForDate,
  isIsoDate,
  isSafeUrl,
  isValidBookingWindow,
  MAX_ORDER_ITEM_QUANTITY,
  MAX_SPORT_CARDS_PER_BOOKING,
  MAX_SPOT_ID,
  type AdminAnalyticsDto,
  type AdminCustomerDto,
  type AdminStatsDto
} from '@repo/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  max,
  min,
  sql
} from 'drizzle-orm';
import {
  bookings,
  foodItems,
  foodItemTranslations,
  newsItems,
  newsItemTranslations,
  orderItems,
  tables
} from '../db/schema.ts';
import {
  ADMIN_ANALYTICS_RESPONSE,
  ADMIN_CUSTOMER_RESPONSE,
  ADMIN_MENU_ITEM_RESPONSE,
  ADMIN_NEWS_ITEM_RESPONSE,
  ADMIN_STATS_RESPONSE,
  BOOKING_RESPONSE,
  ERROR_RESPONSE,
  LOCALE_SCHEMA
} from '../lib/schemas.ts';
import { ADMIN_TOKEN_COOKIE, clearAdminCookies, setAdminCookies } from '../lib/cookies.ts';
import { EXCLUSION_VIOLATION, FOREIGN_KEY_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import { adminTournamentRoutes } from './admin-tournaments.ts';
import { adminVenueConfigRoutes } from './admin-venue-config.ts';
import { slugify } from '../lib/slug.ts';
import { HOUR_MS, warsawDateOf, warsawHourOf, warsawInstant } from '../lib/time.ts';
import { normalizePhone } from '@repo/shared/phone';
import {
  insertOrderItems,
  mustLoadBookingDto,
  phaseOf,
  toBookingDtos
} from '../services/bookings.ts';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '../db/client.ts';
import type { AppInstance } from '../app.ts';

const DAY_MS = 24 * HOUR_MS;

/** Constant-time comparison — hash first so lengths always match. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Rental revenue, from the rate each booking was written at. This used to be a
 * CASE over SPOTS against the rate constant, which quietly restated history
 * whenever a rate changed; now that `bookings.hourly_rate_grosz` locks the
 * price in, last month's takings stay last month's takings.
 */
const RENTAL_GROSZ = sql<number>`coalesce(sum(extract(epoch from (${bookings.endsAt} - ${bookings.startsAt})) / 3600 * ${bookings.hourlyRateGrosz}), 0)::int`;

/** Spot rental + food revenue of confirmed bookings starting in [from, to). */
async function revenueBetween(db: Db, from: Date, to: Date): Promise<number> {
  const inRange = and(
    eq(bookings.status, 'confirmed'),
    gte(bookings.startsAt, from),
    lt(bookings.startsAt, to)
  );
  const [[tablePart], [foodPart]] = await Promise.all([
    db
      .select({
        // Net of discounts so /stats agrees with /analytics for the same day
        grosz: sql<number>`${RENTAL_GROSZ} - coalesce(sum(${bookings.discountGrosz}), 0)::int`
      })
      .from(bookings)
      .where(inRange),
    db
      .select({
        grosz: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPriceGrosz}), 0)::int`
      })
      .from(orderItems)
      .innerJoin(bookings, eq(orderItems.bookingId, bookings.id))
      .where(inRange)
  ]);
  return (tablePart?.grosz ?? 0) + (foodPart?.grosz ?? 0);
}

type FoodItemRow = typeof foodItems.$inferSelect;
type TranslationRow = typeof foodItemTranslations.$inferSelect;

function toAdminMenuItem(item: FoodItemRow, translations: TranslationRow[]) {
  const forItem = translations.filter(t => t.foodItemId === item.id);
  const uk = forItem.find(t => t.locale === 'uk');
  return {
    id: item.id,
    slug: item.slug,
    category: item.category,
    priceGrosz: item.priceGrosz,
    name: uk?.name ?? item.slug,
    description: uk?.description ?? null,
    isAvailable: item.isAvailable,
    translations: forItem.map(t => ({
      locale: t.locale as 'uk' | 'pl' | 'en',
      name: t.name,
      description: t.description
    }))
  };
}

/** Strict UUID shape: a loose 36-char pattern lets malformed ids reach Postgres
 *  as a uuid cast and surface as a logged 500 (22P02) instead of a clean 404. */
const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const BOOKING_ID_PARAMS = Type.Object({ id: Type.String({ pattern: UUID_PATTERN }) });

/** Either the booking is open for edits, or it is not and the reason maps to a code. */
type OpenBookingLookup =
  | { error: string; status: number; booking?: undefined }
  | { error?: undefined; booking: typeof bookings.$inferSelect };

type NewsItemRow = typeof newsItems.$inferSelect;
type NewsTranslationRow = typeof newsItemTranslations.$inferSelect;

/** Staff read the carousel in uk, same convention as the menu tab. */
function toAdminNewsItem(item: NewsItemRow, translations: NewsTranslationRow[]) {
  const forItem = translations.filter(t => t.newsItemId === item.id);
  const uk = forItem.find(t => t.locale === 'uk');
  return {
    id: item.id,
    title: uk?.title ?? forItem[0]?.title ?? '',
    body: uk?.body ?? forItem[0]?.body ?? null,
    imageUrl: item.imageUrl,
    linkUrl: item.linkUrl,
    isPublished: item.isPublished,
    sortOrder: item.sortOrder,
    translations: forItem.map(t => ({
      locale: t.locale as 'uk' | 'pl' | 'en',
      title: t.title,
      body: t.body
    }))
  };
}

/** Blank input clears the column; anything left must be a safe path or http(s) URL. */
function cleanUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function adminRoutes(app: AppInstance, adminToken: string | undefined) {
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
      if (!tokenMatches(request.body.token, adminToken)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      setAdminCookies(reply, request.body.token, app.cookieSecure);
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
      // Accept the token from the HttpOnly cookie (browser) or the x-admin-token
      // header (API clients / tests).
      const header = request.headers['x-admin-token'];
      const provided = typeof header === 'string' ? header : request.cookies[ADMIN_TOKEN_COOKIE];
      if (typeof provided !== 'string' || !tokenMatches(provided, adminToken)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
    });

    admin.get(
      '/api/admin/bookings',
      {
        schema: {
          querystring: Type.Object({
            date: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
            status: Type.Optional(
              Type.Union([Type.Literal('confirmed'), Type.Literal('cancelled')])
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
          const dayStart = warsawInstant(date, 0);
          const dayEnd = new Date(dayStart.getTime() + DAY_MS);
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

    admin.get(
      '/api/admin/customers',
      {
        schema: {
          querystring: Type.Object(
            {
              limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
              offset: Type.Optional(Type.Integer({ minimum: 0 })),
              phone: Type.Optional(Type.String({ maxLength: 25 }))
            },
            { additionalProperties: false }
          ),
          response: { 200: Type.Array(ADMIN_CUSTOMER_RESPONSE) }
        }
      },
      async (request): Promise<AdminCustomerDto[]> => {
        const db = admin.db;
        const limit = request.query.limit ?? 100;
        const offset = request.query.offset ?? 0;
        const phoneFilter =
          request.query.phone && request.query.phone.trim() !== ''
            ? ilike(bookings.customerPhone, `%${request.query.phone.trim()}%`)
            : undefined;

        // Page the customer set first (newest visit first), then compute food
        // totals and latest names only for the returned phones — so all three
        // queries stay bounded instead of scanning the whole bookings table.
        const aggregates = await db
          .select({
            phone: bookings.customerPhone,
            bookingsCount: count(),
            cancelledCount: sql<number>`count(*) filter (where ${bookings.status} = 'cancelled')::int`,
            firstSeen: min(bookings.startsAt),
            lastSeen: max(bookings.startsAt),
            tableGrosz: sql<number>`coalesce(sum(extract(epoch from (${bookings.endsAt} - ${bookings.startsAt})) / 3600 * ${bookings.hourlyRateGrosz}) filter (where ${bookings.status} = 'confirmed'), 0)::int`
          })
          .from(bookings)
          .where(phoneFilter)
          .groupBy(bookings.customerPhone)
          .orderBy(desc(max(bookings.startsAt)))
          .limit(limit)
          .offset(offset);

        const phones = aggregates.map(a => a.phone);
        const [foodByPhone, latestNames] =
          phones.length === 0
            ? [[], []]
            : await Promise.all([
                db
                  .select({
                    phone: bookings.customerPhone,
                    foodGrosz: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPriceGrosz}), 0)::int`
                  })
                  .from(orderItems)
                  .innerJoin(bookings, eq(orderItems.bookingId, bookings.id))
                  .where(
                    and(eq(bookings.status, 'confirmed'), inArray(bookings.customerPhone, phones))
                  )
                  .groupBy(bookings.customerPhone),
                db
                  .selectDistinctOn([bookings.customerPhone], {
                    phone: bookings.customerPhone,
                    name: bookings.customerName
                  })
                  .from(bookings)
                  .where(inArray(bookings.customerPhone, phones))
                  .orderBy(bookings.customerPhone, desc(bookings.startsAt))
              ]);

        const foodMap = new Map(foodByPhone.map(f => [f.phone, f.foodGrosz]));
        const nameMap = new Map(latestNames.map(n => [n.phone, n.name]));

        return aggregates.map(agg => ({
          phone: agg.phone,
          name: nameMap.get(agg.phone) ?? '',
          bookingsCount: agg.bookingsCount,
          cancelledCount: agg.cancelledCount,
          firstSeen: agg.firstSeen?.toISOString() ?? '',
          lastSeen: agg.lastSeen?.toISOString() ?? '',
          totalSpentGrosz: agg.tableGrosz + (foodMap.get(agg.phone) ?? 0)
        }));
      }
    );

    admin.get(
      '/api/admin/stats',
      { schema: { response: { 200: ADMIN_STATS_RESPONSE } } },
      async (): Promise<AdminStatsDto> => {
        const db = admin.db;
        const now = new Date();
        const today = warsawDateOf(now);
        const dayStart = warsawInstant(today, 0);
        const dayEnd = new Date(dayStart.getTime() + DAY_MS);
        const weekStart = new Date(dayEnd.getTime() - 7 * DAY_MS);
        const monthStart = new Date(dayEnd.getTime() - 30 * DAY_MS);

        const confirmedToday = and(
          eq(bookings.status, 'confirmed'),
          gte(bookings.startsAt, dayStart),
          lt(bookings.startsAt, dayEnd)
        );

        const [
          [todayCount],
          [activeCount],
          [upcomingCount],
          todayRevenueGrosz,
          weekRevenueGrosz,
          topItems
        ] = await Promise.all([
          db.select({ n: count() }).from(bookings).where(confirmedToday),
          db
            .select({ n: count() })
            .from(bookings)
            .where(
              and(
                eq(bookings.status, 'confirmed'),
                lte(bookings.startsAt, now),
                sql`${bookings.endsAt} > ${now}`
              )
            ),
          db
            .select({ n: count() })
            .from(bookings)
            .where(
              and(
                eq(bookings.status, 'confirmed'),
                sql`${bookings.startsAt} > ${now}`,
                lt(bookings.startsAt, dayEnd)
              )
            ),
          revenueBetween(db, dayStart, dayEnd),
          revenueBetween(db, weekStart, dayEnd),
          db
            .select({
              foodItemId: orderItems.foodItemId,
              slug: foodItems.slug,
              totalQuantity: sql<number>`sum(${orderItems.quantity})::int`
            })
            .from(orderItems)
            .innerJoin(foodItems, eq(orderItems.foodItemId, foodItems.id))
            .innerJoin(bookings, eq(orderItems.bookingId, bookings.id))
            .where(and(eq(bookings.status, 'confirmed'), gte(bookings.startsAt, monthStart)))
            .groupBy(orderItems.foodItemId, foodItems.slug)
            .orderBy(desc(sql`sum(${orderItems.quantity})`))
            .limit(5)
        ]);

        return {
          date: today,
          todayBookings: todayCount?.n ?? 0,
          activeNow: activeCount?.n ?? 0,
          upcomingToday: upcomingCount?.n ?? 0,
          todayRevenueGrosz,
          weekRevenueGrosz,
          topItems
        };
      }
    );

    // Reception desk: create a booking on behalf of a walk-in/phone client.
    // Same operating-hours rules as the public flow, but the start may be any
    // hour of the current day (logging a game that already started is fine).
    admin.post(
      '/api/admin/bookings',
      {
        schema: {
          body: Type.Object(
            {
              tableId: Type.Integer({ minimum: 1, maximum: MAX_SPOT_ID }),
              date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
              startHour: Type.Integer({ minimum: 0, maximum: 23 }),
              durationHours: Type.Integer({ minimum: 1, maximum: 8 }),
              customerName: Type.String({ minLength: 1, maxLength: 120 }),
              customerPhone: Type.String({ minLength: 5, maxLength: 25 }),
              sportCardCount: Type.Optional(
                Type.Integer({ minimum: 0, maximum: MAX_SPORT_CARDS_PER_BOOKING })
              )
            },
            { additionalProperties: false }
          ),
          response: { 201: BOOKING_RESPONSE, '4xx': ERROR_RESPONSE }
        }
      },
      async (request, reply) => {
        const { tableId, date, startHour, durationHours, customerName } = request.body;
        if (!isIsoDate(date)) return reply.code(400).send({ error: 'invalid_date' });
        const customerPhone = normalizePhone(request.body.customerPhone);
        if (customerPhone === null) return reply.code(422).send({ error: 'invalid_phone' });
        const { rates, hours } = await admin.venueConfig.get();
        if (!isValidBookingWindow(date, startHour, durationHours, hours)) {
          return reply.code(422).send({ error: 'outside_operating_hours' });
        }
        const startsAt = warsawInstant(date, startHour);
        const dayStart = warsawInstant(warsawDateOf(new Date()), 0);
        if (startsAt.getTime() < dayStart.getTime()) {
          return reply.code(422).send({ error: 'start_in_past' });
        }
        const endsAt = new Date(startsAt.getTime() + durationHours * HOUR_MS);

        const [spot] = await admin.db.select().from(tables).where(eq(tables.id, tableId));
        if (!spot) return reply.code(422).send({ error: 'unknown_table' });
        const sportCardCount = request.body.sportCardCount ?? 0;
        const lockedRateGrosz = hourlyRateGrosz(spot, rates);
        const discountGrosz = discountGroszFor(sportCardCount, lockedRateGrosz * durationHours);

        try {
          const [created] = await admin.db
            .insert(bookings)
            .values({
              tableId,
              customerName,
              customerPhone,
              startsAt,
              endsAt,
              sportCardCount,
              hourlyRateGrosz: lockedRateGrosz,
              discountGrosz
            })
            .returning({ id: bookings.id });
          assert(created, 'insert returned no row');
          const dto = await mustLoadBookingDto(admin.db, created.id);
          admin.availabilityHub.notify(date);
          return reply.code(201).send(dto);
        } catch (err) {
          if (pgErrorCode(err) === EXCLUSION_VIOLATION) {
            return reply.code(409).send({ error: 'slot_taken' });
          }
          throw err;
        }
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
        if (phase === 'cancelled' || phase === 'finished') {
          return reply.code(409).send({ error: `booking_${phase}` });
        }
        await admin.db
          .update(bookings)
          .set({ status: 'cancelled' })
          .where(eq(bookings.id, booking.id));
        admin.availabilityHub.notify(warsawDateOf(booking.startsAt));
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
              startHour: Type.Optional(Type.Integer({ minimum: 0, maximum: 23 })),
              durationHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 8 })),
              customerName: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
              customerPhone: Type.Optional(Type.String({ minLength: 5, maxLength: 25 })),
              sportCardCount: Type.Optional(
                Type.Integer({ minimum: 0, maximum: MAX_SPORT_CARDS_PER_BOOKING })
              ),
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

        const [booking] = await admin.db
          .select()
          .from(bookings)
          .where(eq(bookings.id, request.params.id));
        if (!booking) return reply.code(404).send({ error: 'not_found' });

        const previousDate = warsawDateOf(booking.startsAt);
        // Any one of the three may move; the other two hold their current value,
        // so "just make it two hours" needs no date or hour from the caller.
        const date = patch.date ?? previousDate;
        if (!isIsoDate(date)) return reply.code(400).send({ error: 'invalid_date' });
        const startHour = patch.startHour ?? warsawHourOf(booking.startsAt);
        const durationHours =
          patch.durationHours ??
          Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / HOUR_MS);
        const { rates, hours } = await admin.venueConfig.get();
        if (!isValidBookingWindow(date, startHour, durationHours, hours)) {
          return reply.code(422).send({ error: 'outside_operating_hours' });
        }

        const customerPhone =
          patch.customerPhone === undefined ? undefined : normalizePhone(patch.customerPhone);
        if (customerPhone === null) return reply.code(422).send({ error: 'invalid_phone' });

        const tableId = patch.tableId ?? booking.tableId;
        const [spot] = await admin.db.select().from(tables).where(eq(tables.id, tableId));
        if (!spot) return reply.code(422).send({ error: 'unknown_table' });

        // Moving to a different spot means a different tier, so the rental is
        // re-quoted at today's rate. Staying put keeps the locked rate: making a
        // booking longer must not silently reprice it at a newer one.
        const hourlyRate =
          tableId === booking.tableId ? booking.hourlyRateGrosz : hourlyRateGrosz(spot, rates);

        // Cards and duration both feed the cap, so the discount is recomputed
        // whenever either could have moved — same rule as extend.
        const sportCardCount = patch.sportCardCount ?? booking.sportCardCount;
        const startsAt = warsawInstant(date, startHour);
        const endsAt = new Date(startsAt.getTime() + durationHours * HOUR_MS);
        const discountGrosz = discountGroszFor(sportCardCount, hourlyRate * durationHours);

        try {
          await admin.db
            .update(bookings)
            .set({
              tableId,
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
      if (booking.status === 'cancelled') return { error: 'booking_cancelled', status: 409 };
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
                    foodItemId: Type.Integer({ minimum: 1 }),
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
            id: Type.String({ pattern: UUID_PATTERN }),
            itemId: Type.String({ pattern: UUID_PATTERN })
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
            and(
              eq(orderItems.id, request.params.itemId),
              eq(orderItems.bookingId, found.booking.id)
            )
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
            id: Type.String({ pattern: UUID_PATTERN }),
            itemId: Type.String({ pattern: UUID_PATTERN })
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
            and(
              eq(orderItems.id, request.params.itemId),
              eq(orderItems.bookingId, found.booking.id)
            )
          )
          .returning({ id: orderItems.id });
        if (!deleted) return reply.code(404).send({ error: 'not_found' });
        return mustLoadBookingDto(admin.db, found.booking.id);
      }
    );

    admin.get(
      '/api/admin/analytics',
      {
        schema: {
          querystring: Type.Object({
            days: Type.Optional(Type.Integer({ minimum: 7, maximum: 90 }))
          }),
          response: { 200: ADMIN_ANALYTICS_RESPONSE }
        }
      },
      async (request): Promise<AdminAnalyticsDto> => {
        const db = admin.db;
        const days = request.query.days ?? 30;
        const today = warsawDateOf(new Date());
        const windowEnd = new Date(warsawInstant(today, 0).getTime() + DAY_MS);
        const windowStart = new Date(windowEnd.getTime() - days * DAY_MS);
        const confirmedInWindow = and(
          eq(bookings.status, 'confirmed'),
          gte(bookings.startsAt, windowStart),
          lt(bookings.startsAt, windowEnd)
        );
        const warsawDay = sql<string>`to_char(${bookings.startsAt} at time zone 'Europe/Warsaw', 'YYYY-MM-DD')`;

        const [rentalByDay, foodByDay, byTable, byHour] = await Promise.all([
          db
            .select({
              date: warsawDay,
              bookings: count(),
              tableGrosz: RENTAL_GROSZ,
              discountGrosz: sql<number>`coalesce(sum(${bookings.discountGrosz}), 0)::int`
            })
            .from(bookings)
            .innerJoin(tables, eq(bookings.tableId, tables.id))
            .where(confirmedInWindow)
            .groupBy(warsawDay),
          db
            .select({
              date: warsawDay,
              foodGrosz: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPriceGrosz}), 0)::int`
            })
            .from(orderItems)
            .innerJoin(bookings, eq(orderItems.bookingId, bookings.id))
            .where(confirmedInWindow)
            .groupBy(warsawDay),
          db
            .select({
              tableId: bookings.tableId,
              bookedHours: sql<number>`coalesce(sum(extract(epoch from (${bookings.endsAt} - ${bookings.startsAt})) / 3600), 0)::float`
            })
            .from(bookings)
            .where(confirmedInWindow)
            .groupBy(bookings.tableId),
          db
            .select({
              hour: sql<number>`extract(hour from ${bookings.startsAt} at time zone 'Europe/Warsaw')::int`,
              bookings: count()
            })
            .from(bookings)
            .where(confirmedInWindow)
            .groupBy(sql`extract(hour from ${bookings.startsAt} at time zone 'Europe/Warsaw')`)
        ]);

        const rentalMap = new Map(rentalByDay.map(r => [r.date, r]));
        const foodMap = new Map(foodByDay.map(f => [f.date, f.foodGrosz]));
        const { hours } = await admin.venueConfig.get();

        // Dense series: every day in the window, oldest first
        const daily = [];
        let openHoursTotal = 0;
        for (let i = days - 1; i >= 0; i--) {
          const dayDate = warsawDateOf(new Date(windowEnd.getTime() - (i + 1) * DAY_MS + HOUR_MS));
          const rental = rentalMap.get(dayDate);
          const { open, close } = hoursForDate(dayDate, hours);
          openHoursTotal += close - open;
          daily.push({
            date: dayDate,
            bookings: rental?.bookings ?? 0,
            revenueGrosz:
              (rental?.tableGrosz ?? 0) - (rental?.discountGrosz ?? 0) + (foodMap.get(dayDate) ?? 0)
          });
        }

        const allTables = await db.select().from(tables).orderBy(tables.id);
        const bookedByTable = new Map(byTable.map(t => [t.tableId, t.bookedHours]));

        return {
          days,
          daily,
          tables: allTables.map(t => ({
            tableId: t.id,
            bookedHours: bookedByTable.get(t.id) ?? 0,
            openHours: openHoursTotal
          })),
          startHours: byHour
            .map(h => ({ hour: h.hour, bookings: h.bookings }))
            .sort((a, b) => a.hour - b.hour)
        };
      }
    );

    // Full menu incl. hidden items — staff view, uk names
    admin.get(
      '/api/admin/menu',
      { schema: { response: { 200: Type.Array(ADMIN_MENU_ITEM_RESPONSE) } } },
      async () => {
        const [items, translations] = await Promise.all([
          admin.db.select().from(foodItems).orderBy(foodItems.category, foodItems.id),
          admin.db.select().from(foodItemTranslations)
        ]);
        return items.map(item => toAdminMenuItem(item, translations));
      }
    );

    // Menu management. Historic orders keep their unit price; deleting is
    // blocked once a dish appears in any order (hide it instead).
    const TRANSLATIONS_BODY = Type.Array(
      Type.Object(
        {
          locale: LOCALE_SCHEMA,
          name: Type.String({ minLength: 1, maxLength: 120 }),
          description: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()]))
        },
        { additionalProperties: false }
      ),
      { minItems: 1, maxItems: 3 }
    );

    admin.post(
      '/api/admin/menu',
      {
        schema: {
          body: Type.Object(
            {
              category: Type.Union([
                Type.Literal('snack'),
                Type.Literal('main'),
                Type.Literal('drink'),
                Type.Literal('dessert')
              ]),
              priceGrosz: Type.Integer({ minimum: 0, maximum: 1_000_00 }),
              translations: TRANSLATIONS_BODY
            },
            { additionalProperties: false }
          ),
          response: { 201: ADMIN_MENU_ITEM_RESPONSE, '4xx': ERROR_RESPONSE }
        }
      },
      async (request, reply) => {
        const { category, priceGrosz, translations } = request.body;
        const en = translations.find(t => t.locale === 'en');
        const uk = translations.find(t => t.locale === 'uk');
        const base = slugify((en ?? uk ?? translations[0]!).name, 'dish');

        const created = await admin.db.transaction(async tx => {
          // Unique slug: append a counter on collision
          let slug = base;
          for (let attempt = 2; attempt < 20; attempt++) {
            const [existing] = await tx
              .select({ id: foodItems.id })
              .from(foodItems)
              .where(eq(foodItems.slug, slug));
            if (!existing) break;
            slug = `${base}-${attempt}`;
          }
          const [item] = await tx
            .insert(foodItems)
            .values({ slug, category, priceGrosz })
            .returning();
          assert(item, 'insert returned no row');
          await tx.insert(foodItemTranslations).values(
            translations.map(t => ({
              foodItemId: item.id,
              locale: t.locale,
              name: t.name.trim(),
              description: t.description?.trim() || null
            }))
          );
          return item;
        });

        const rows = await admin.db
          .select()
          .from(foodItemTranslations)
          .where(eq(foodItemTranslations.foodItemId, created.id));
        return reply.code(201).send(toAdminMenuItem(created, rows));
      }
    );

    admin.patch(
      '/api/admin/menu/:id',
      {
        schema: {
          params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
          body: Type.Object(
            {
              isAvailable: Type.Optional(Type.Boolean()),
              priceGrosz: Type.Optional(Type.Integer({ minimum: 0, maximum: 1_000_00 })),
              category: Type.Optional(
                Type.Union([
                  Type.Literal('snack'),
                  Type.Literal('main'),
                  Type.Literal('drink'),
                  Type.Literal('dessert')
                ])
              ),
              translations: Type.Optional(TRANSLATIONS_BODY)
            },
            { additionalProperties: false }
          ),
          response: { 200: ADMIN_MENU_ITEM_RESPONSE, '4xx': ERROR_RESPONSE }
        }
      },
      async (request, reply) => {
        const { isAvailable, priceGrosz, category, translations } = request.body;
        const updated = await admin.db.transaction(async tx => {
          const [item] = await tx
            .update(foodItems)
            .set({
              ...(isAvailable !== undefined ? { isAvailable } : {}),
              ...(priceGrosz !== undefined ? { priceGrosz } : {}),
              ...(category !== undefined ? { category } : {})
            })
            .where(eq(foodItems.id, request.params.id))
            .returning();
          if (!item) return null;
          for (const t of translations ?? []) {
            await tx
              .insert(foodItemTranslations)
              .values({
                foodItemId: item.id,
                locale: t.locale,
                name: t.name.trim(),
                description: t.description?.trim() || null
              })
              .onConflictDoUpdate({
                target: [foodItemTranslations.foodItemId, foodItemTranslations.locale],
                set: { name: t.name.trim(), description: t.description?.trim() || null }
              });
          }
          return item;
        });
        if (!updated) return reply.code(404).send({ error: 'not_found' });

        const rows = await admin.db
          .select()
          .from(foodItemTranslations)
          .where(eq(foodItemTranslations.foodItemId, updated.id));
        return toAdminMenuItem(updated, rows);
      }
    );

    admin.delete(
      '/api/admin/menu/:id',
      {
        schema: {
          params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
          response: { 200: Type.Object({ deleted: Type.Boolean() }), '4xx': ERROR_RESPONSE }
        }
      },
      async (request, reply) => {
        const [{ n } = { n: 0 }] = await admin.db
          .select({ n: count() })
          .from(orderItems)
          .where(eq(orderItems.foodItemId, request.params.id));
        if (n > 0) return reply.code(409).send({ error: 'has_orders' });

        // Translations cascade via FK
        try {
          const [deleted] = await admin.db
            .delete(foodItems)
            .where(eq(foodItems.id, request.params.id))
            .returning({ id: foodItems.id });
          if (!deleted) return reply.code(404).send({ error: 'not_found' });
        } catch (err) {
          // An order inserted between the count() and the delete makes the delete
          // violate order_items' FK — report it as has_orders, not a 500.
          if (pgErrorCode(err) === FOREIGN_KEY_VIOLATION) {
            return reply.code(409).send({ error: 'has_orders' });
          }
          throw err;
        }
        return { deleted: true };
      }
    );

    // News carousel on the home screen. Nothing references these rows, so
    // deletes need no guard — but hiding beats deleting for a promo that may
    // come back, hence isPublished.
    const NEWS_TRANSLATIONS_BODY = Type.Array(
      Type.Object(
        {
          locale: LOCALE_SCHEMA,
          title: Type.String({ minLength: 1, maxLength: 120 }),
          body: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()]))
        },
        { additionalProperties: false }
      ),
      { minItems: 1, maxItems: 3 }
    );
    const NEWS_URL = Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()]));
    const NEWS_SORT_ORDER = Type.Optional(Type.Integer({ minimum: 0, maximum: 9999 }));

    admin.get(
      '/api/admin/news',
      { schema: { response: { 200: Type.Array(ADMIN_NEWS_ITEM_RESPONSE) } } },
      async () => {
        const [items, translations] = await Promise.all([
          admin.db
            .select()
            .from(newsItems)
            .orderBy(asc(newsItems.sortOrder), desc(newsItems.createdAt)),
          admin.db.select().from(newsItemTranslations)
        ]);
        return items.map(item => toAdminNewsItem(item, translations));
      }
    );

    admin.post(
      '/api/admin/news',
      {
        schema: {
          body: Type.Object(
            {
              imageUrl: NEWS_URL,
              linkUrl: NEWS_URL,
              sortOrder: NEWS_SORT_ORDER,
              isPublished: Type.Optional(Type.Boolean()),
              translations: NEWS_TRANSLATIONS_BODY
            },
            { additionalProperties: false }
          ),
          response: { 201: ADMIN_NEWS_ITEM_RESPONSE, '4xx': ERROR_RESPONSE }
        }
      },
      async (request, reply) => {
        const { sortOrder, isPublished, translations } = request.body;
        const imageUrl = cleanUrl(request.body.imageUrl) ?? null;
        const linkUrl = cleanUrl(request.body.linkUrl) ?? null;
        if ([imageUrl, linkUrl].some(url => url !== null && !isSafeUrl(url))) {
          return reply.code(422).send({ error: 'invalid_url' });
        }

        const created = await admin.db.transaction(async tx => {
          const [item] = await tx
            .insert(newsItems)
            .values({
              imageUrl,
              linkUrl,
              ...(sortOrder !== undefined ? { sortOrder } : {}),
              ...(isPublished !== undefined ? { isPublished } : {})
            })
            .returning();
          assert(item, 'insert returned no row');
          await tx.insert(newsItemTranslations).values(
            translations.map(t => ({
              newsItemId: item.id,
              locale: t.locale,
              title: t.title.trim(),
              body: t.body?.trim() || null
            }))
          );
          return item;
        });

        const rows = await admin.db
          .select()
          .from(newsItemTranslations)
          .where(eq(newsItemTranslations.newsItemId, created.id));
        return reply.code(201).send(toAdminNewsItem(created, rows));
      }
    );

    admin.patch(
      '/api/admin/news/:id',
      {
        schema: {
          params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
          body: Type.Object(
            {
              imageUrl: NEWS_URL,
              linkUrl: NEWS_URL,
              sortOrder: NEWS_SORT_ORDER,
              isPublished: Type.Optional(Type.Boolean()),
              translations: Type.Optional(NEWS_TRANSLATIONS_BODY)
            },
            { additionalProperties: false }
          ),
          response: { 200: ADMIN_NEWS_ITEM_RESPONSE, '4xx': ERROR_RESPONSE }
        }
      },
      async (request, reply) => {
        const { sortOrder, isPublished, translations } = request.body;
        // undefined = leave the column alone, null = clear it
        const imageUrl = cleanUrl(request.body.imageUrl);
        const linkUrl = cleanUrl(request.body.linkUrl);
        if ([imageUrl, linkUrl].some(url => typeof url === 'string' && !isSafeUrl(url))) {
          return reply.code(422).send({ error: 'invalid_url' });
        }

        const updated = await admin.db.transaction(async tx => {
          const patch = {
            ...(imageUrl !== undefined ? { imageUrl } : {}),
            ...(linkUrl !== undefined ? { linkUrl } : {}),
            ...(sortOrder !== undefined ? { sortOrder } : {}),
            ...(isPublished !== undefined ? { isPublished } : {})
          };
          // An all-translations PATCH touches no column of news_items; Drizzle
          // refuses an empty `set`, so read the row instead of updating it.
          const [item] =
            Object.keys(patch).length > 0
              ? await tx
                  .update(newsItems)
                  .set(patch)
                  .where(eq(newsItems.id, request.params.id))
                  .returning()
              : await tx.select().from(newsItems).where(eq(newsItems.id, request.params.id));
          if (!item) return null;
          for (const t of translations ?? []) {
            await tx
              .insert(newsItemTranslations)
              .values({
                newsItemId: item.id,
                locale: t.locale,
                title: t.title.trim(),
                body: t.body?.trim() || null
              })
              .onConflictDoUpdate({
                target: [newsItemTranslations.newsItemId, newsItemTranslations.locale],
                set: { title: t.title.trim(), body: t.body?.trim() || null }
              });
          }
          return item;
        });
        if (!updated) return reply.code(404).send({ error: 'not_found' });

        const rows = await admin.db
          .select()
          .from(newsItemTranslations)
          .where(eq(newsItemTranslations.newsItemId, updated.id));
        return toAdminNewsItem(updated, rows);
      }
    );

    admin.delete(
      '/api/admin/news/:id',
      {
        schema: {
          params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
          response: { 200: Type.Object({ deleted: Type.Boolean() }), '4xx': ERROR_RESPONSE }
        }
      },
      async (request, reply) => {
        // Translations cascade via FK
        const [deleted] = await admin.db
          .delete(newsItems)
          .where(eq(newsItems.id, request.params.id))
          .returning({ id: newsItems.id });
        if (!deleted) return reply.code(404).send({ error: 'not_found' });
        return { deleted: true };
      }
    );

    // Tournaments + their rosters. Registered here rather than defined inline so
    // this file stays about bookings, customers, menu and news; the plugin
    // inherits the token hook above, which is the whole point of the scope.
    await admin.register(adminTournamentRoutes);
    await admin.register(adminVenueConfigRoutes);
  });
}
