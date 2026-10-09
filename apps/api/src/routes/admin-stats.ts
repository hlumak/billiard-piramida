import { Type } from 'typebox';
import { addDays, hoursForDate, type AdminAnalyticsDto, type AdminStatsDto } from '@repo/shared';
import { and, count, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { bookings, foodItems, orderItems, tables } from '../db/schema.ts';
import { ADMIN_ANALYTICS_RESPONSE, ADMIN_STATS_RESPONSE } from '../lib/schemas.ts';
import { warsawDateOf, warsawDayRange } from '../lib/time.ts';
import type { Db } from '../db/client.ts';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

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

/**
 * The overview tiles and the analytics charts.
 * Registered inside the admin scope (routes/admin.ts), behind its token hook.
 */
export const adminStatsRoutes: FastifyPluginAsyncTypebox = async admin => {
  admin.get(
    '/api/admin/stats',
    { schema: { response: { 200: ADMIN_STATS_RESPONSE } } },
    async (): Promise<AdminStatsDto> => {
      const db = admin.db;
      const now = new Date();
      const today = warsawDateOf(now);
      const [dayStart, dayEnd] = warsawDayRange(today);
      // Rolling windows that end with today, in whole local days
      const weekStart = warsawDayRange(addDays(today, -6))[0];
      const monthStart = warsawDayRange(addDays(today, -29))[0];

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
      const windowEnd = warsawDayRange(today)[1];
      const windowStart = warsawDayRange(addDays(today, -(days - 1)))[0];
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
        const dayDate = addDays(today, -i);
        const rental = rentalMap.get(dayDate);
        const { open, close } = hoursForDate(dayDate, hours);
        openHoursTotal += Math.max(0, close - open);
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
          kind: t.kind,
          label: t.label,
          bookedHours: bookedByTable.get(t.id) ?? 0,
          openHours: openHoursTotal
        })),
        startHours: byHour
          .map(h => ({ hour: h.hour, bookings: h.bookings }))
          .sort((a, b) => a.hour - b.hour)
      };
    }
  );
};
