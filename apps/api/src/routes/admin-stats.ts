import { Type } from 'typebox';
import {
  addDays,
  hoursForDate,
  MAX_BOOKING_MINUTES,
  nightTailMinutes,
  type AdminAnalyticsDto,
  type AdminMonthlyRevenueDto,
  type AdminStatsDto,
  type IsoDate,
  type WeeklyHours
} from '@repo/shared';
import { and, count, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { bookings, foodItems, orderItems, tables } from '../db/schema.ts';
import {
  ADMIN_ANALYTICS_RESPONSE,
  ADMIN_MONTHLY_REVENUE_RESPONSE,
  ADMIN_STATS_RESPONSE
} from '../lib/schemas.ts';
import { clubDayOf, clubDayRange, MINUTE_MS } from '../lib/time.ts';
import type { Db } from '../db/client.ts';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

/**
 * Rental revenue, from the rate each booking was written at. This used to be a
 * CASE over SPOTS against the rate constant, which quietly restated history
 * whenever a rate changed; now that `bookings.hourly_rate_grosz` locks the
 * price in, last month's takings stay last month's takings.
 */
const RENTAL_GROSZ = sql<number>`coalesce(sum(extract(epoch from (${bookings.endsAt} - ${bookings.startsAt})) / 3600 * ${bookings.hourlyRateGrosz}), 0)::int`;

/**
 * Whether a booking's start falls in the small hours a late night still
 * covers: then it counts on the evening before. Per weekday, from the hours
 * in force — the tail of each day's night, indexed by the weekday after it.
 */
function inPreviousNight(hours: WeeklyHours) {
  const local = sql`(${bookings.startsAt} at time zone 'Europe/Warsaw')`;
  // Indexed by Postgres dow (0 = Sunday), each the minutes the evening before ran past midnight
  const tails = [0, 1, 2, 3, 4, 5, 6].map(dow => nightTailMinutes(hours[(dow + 6) % 7]!));
  return sql`(extract(hour from ${local}) * 60 + extract(minute from ${local})) < (array[${sql.raw(tails.join(','))}])[extract(dow from ${local})::int + 1]`;
}

/** The club's day of each booking's start, as 'YYYY-MM-DD' in Warsaw. */
function clubDayOfStart(hours: WeeklyHours) {
  return sql<string>`to_char((${bookings.startsAt} at time zone 'Europe/Warsaw') - case when ${inPreviousNight(hours)} then interval '1 day' else interval '0' end, 'YYYY-MM-DD')`;
}

/** 'YYYY-MM' of the month `back` months before the one `date` is in. */
function monthBefore(date: string, back: number): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

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
        grosz: sql<number>`coalesce(sum(${orderItems.quantity}::bigint * ${orderItems.unitPriceGrosz}), 0)::float8`
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
      const { hours } = await admin.venueConfig.get();
      // The club's today: a late night counts as the evening it began
      const today = clubDayOf(now, hours).date;
      const [dayStart, dayEnd] = clubDayRange(today, hours);
      // Rolling windows that end with today, in whole club days
      const weekStart = clubDayRange(addDays(today, -6), hours)[0];
      const monthStart = clubDayRange(addDays(today, -29), hours)[0];

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
              // Implied by the next line (no booking outlasts
              // MAX_BOOKING_MINUTES), and what bounds the index scan
              gte(bookings.startsAt, new Date(now.getTime() - MAX_BOOKING_MINUTES * MINUTE_MS)),
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
      const { hours } = await admin.venueConfig.get();
      const today = clubDayOf(new Date(), hours).date;
      const windowEnd = clubDayRange(today, hours)[1];
      const windowStart = clubDayRange(addDays(today, -(days - 1)), hours)[0];
      const confirmedInWindow = and(
        eq(bookings.status, 'confirmed'),
        gte(bookings.startsAt, windowStart),
        lt(bookings.startsAt, windowEnd)
      );
      // The club day of each start: the small hours of a late night go to its evening
      const previousNight = inPreviousNight(hours);
      const warsawDay = clubDayOfStart(hours);
      // Hours of the club's day, so 00:30 on a late night sorts after 23:00 (as 24)
      const startHour = sql<number>`(extract(hour from ${bookings.startsAt} at time zone 'Europe/Warsaw') + case when ${previousNight} then 24 else 0 end)::int`;

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
            foodGrosz: sql<number>`coalesce(sum(${orderItems.quantity}::bigint * ${orderItems.unitPriceGrosz}), 0)::float8`
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
            hour: startHour,
            bookings: count()
          })
          .from(bookings)
          .where(confirmedInWindow)
          .groupBy(startHour)
      ]);

      const rentalMap = new Map(rentalByDay.map(r => [r.date, r]));
      const foodMap = new Map(foodByDay.map(f => [f.date, f.foodGrosz]));

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

  /**
   * Takings per calendar month, oldest first, ending with the month in
   * progress (so far). Every month in the window is listed, quiet ones at 0,
   * so the chart's bars stay evenly spaced in time.
   */
  admin.get(
    '/api/admin/analytics/monthly',
    {
      schema: {
        querystring: Type.Object({
          months: Type.Optional(Type.Integer({ minimum: 1, maximum: 36 }))
        }),
        response: { 200: Type.Array(ADMIN_MONTHLY_REVENUE_RESPONSE) }
      }
    },
    async (request): Promise<AdminMonthlyRevenueDto[]> => {
      const db = admin.db;
      const months = request.query.months ?? 12;
      const { hours } = await admin.venueConfig.get();
      const today = clubDayOf(new Date(), hours).date;
      const firstMonth = monthBefore(today, months - 1);
      const inWindow = and(
        eq(bookings.status, 'confirmed'),
        gte(bookings.startsAt, clubDayRange(`${firstMonth}-01` as IsoDate, hours)[0]),
        lt(bookings.startsAt, clubDayRange(today, hours)[1])
      );
      const clubMonth = sql<string>`left(${clubDayOfStart(hours)}, 7)`;

      const [rentalByMonth, foodByMonth] = await Promise.all([
        db
          .select({
            month: clubMonth,
            bookings: count(),
            rentalGrosz: sql<number>`${RENTAL_GROSZ} - coalesce(sum(${bookings.discountGrosz}), 0)::int`
          })
          .from(bookings)
          .where(inWindow)
          .groupBy(clubMonth),
        db
          .select({
            month: clubMonth,
            foodGrosz: sql<number>`coalesce(sum(${orderItems.quantity}::bigint * ${orderItems.unitPriceGrosz}), 0)::float8`
          })
          .from(orderItems)
          .innerJoin(bookings, eq(orderItems.bookingId, bookings.id))
          .where(inWindow)
          .groupBy(clubMonth)
      ]);

      const rentalMap = new Map(rentalByMonth.map(r => [r.month, r]));
      const foodMap = new Map(foodByMonth.map(f => [f.month, f.foodGrosz]));
      const series: AdminMonthlyRevenueDto[] = [];
      for (let back = months - 1; back >= 0; back--) {
        const month = monthBefore(today, back);
        const rental = rentalMap.get(month);
        const rentalGrosz = rental?.rentalGrosz ?? 0;
        const foodGrosz = foodMap.get(month) ?? 0;
        series.push({
          month,
          bookings: rental?.bookings ?? 0,
          rentalGrosz,
          foodGrosz,
          revenueGrosz: rentalGrosz + foodGrosz
        });
      }
      return series;
    }
  );
};
