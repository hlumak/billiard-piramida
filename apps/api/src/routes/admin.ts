import { createHash, timingSafeEqual } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import {
  HOURLY_RATE_GROSZ,
  isIsoDate,
  type AdminCustomerDto,
  type AdminStatsDto,
  type BookingDto
} from '@repo/shared';
import { and, count, desc, eq, gte, inArray, lt, lte, max, min, sql } from 'drizzle-orm';
import { bookings, foodItems, orderItems } from '../db/schema.ts';
import {
  ADMIN_CUSTOMER_RESPONSE,
  ADMIN_STATS_RESPONSE,
  BOOKING_RESPONSE,
  ERROR_RESPONSE
} from '../lib/schemas.ts';
import { HOUR_MS, warsawDateOf, warsawInstant } from '../lib/time.ts';
import { phaseOf } from '../services/bookings.ts';
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

/** Table rental + food revenue of confirmed bookings starting in [from, to). */
async function revenueBetween(db: Db, from: Date, to: Date): Promise<number> {
  const inRange = and(
    eq(bookings.status, 'confirmed'),
    gte(bookings.startsAt, from),
    lt(bookings.startsAt, to)
  );
  const [[tablePart], [foodPart]] = await Promise.all([
    db
      .select({
        grosz: sql<number>`coalesce(sum(extract(epoch from (${bookings.endsAt} - ${bookings.startsAt})) / 3600 * ${HOURLY_RATE_GROSZ}), 0)::int`
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

/** Compose BookingDto[] for a set of rows without per-booking queries. */
async function toBookingDtos(
  db: Db,
  rows: (typeof bookings.$inferSelect)[]
): Promise<BookingDto[]> {
  const ids = rows.map(b => b.id);
  const items =
    ids.length === 0
      ? []
      : await db
          .select({
            id: orderItems.id,
            bookingId: orderItems.bookingId,
            foodItemId: orderItems.foodItemId,
            slug: foodItems.slug,
            quantity: orderItems.quantity,
            unitPriceGrosz: orderItems.unitPriceGrosz
          })
          .from(orderItems)
          .innerJoin(foodItems, eq(orderItems.foodItemId, foodItems.id))
          .where(inArray(orderItems.bookingId, ids));

  const now = new Date();
  return rows.map(booking => {
    const bookingItems = items
      .filter(item => item.bookingId === booking.id)
      .map(({ bookingId: _bookingId, ...item }) => item);
    const durationHours = Math.round(
      (booking.endsAt.getTime() - booking.startsAt.getTime()) / HOUR_MS
    );
    const tableTotalGrosz = durationHours * HOURLY_RATE_GROSZ;
    const foodTotalGrosz = bookingItems.reduce((sum, i) => sum + i.quantity * i.unitPriceGrosz, 0);
    return {
      id: booking.id,
      tableId: booking.tableId,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      status: booking.status,
      phase: phaseOf(booking.status, booking.startsAt, booking.endsAt, now),
      items: bookingItems,
      tableTotalGrosz,
      foodTotalGrosz,
      totalGrosz: tableTotalGrosz + foodTotalGrosz
    };
  });
}

export async function adminRoutes(app: AppInstance, adminToken: string | undefined) {
  await app.register(async scope => {
    // Encapsulated scope: the auth hook applies to /api/admin routes only
    const admin = scope.withTypeProvider<TypeBoxTypeProvider>();

    admin.addHook('onRequest', async (request, reply) => {
      if (!adminToken) {
        return reply.code(503).send({ error: 'admin_disabled' });
      }
      const header = request.headers['x-admin-token'];
      if (typeof header !== 'string' || !tokenMatches(header, adminToken)) {
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
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 }))
          }),
          response: { 200: Type.Array(BOOKING_RESPONSE), '4xx': ERROR_RESPONSE }
        }
      },
      async (request, reply) => {
        const { date, status, limit = 100 } = request.query;

        const filters = [];
        if (date !== undefined) {
          if (!isIsoDate(date)) return reply.code(400).send({ error: 'invalid_date' });
          const dayStart = warsawInstant(date, 0);
          const dayEnd = new Date(dayStart.getTime() + DAY_MS);
          filters.push(gte(bookings.startsAt, dayStart), lt(bookings.startsAt, dayEnd));
        }
        if (status !== undefined) filters.push(eq(bookings.status, status));

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
      { schema: { response: { 200: Type.Array(ADMIN_CUSTOMER_RESPONSE) } } },
      async (): Promise<AdminCustomerDto[]> => {
        const db = admin.db;
        const [aggregates, foodByPhone, latestNames] = await Promise.all([
          db
            .select({
              phone: bookings.customerPhone,
              bookingsCount: count(),
              cancelledCount: sql<number>`count(*) filter (where ${bookings.status} = 'cancelled')::int`,
              firstSeen: min(bookings.startsAt),
              lastSeen: max(bookings.startsAt),
              tableGrosz: sql<number>`coalesce(sum(extract(epoch from (${bookings.endsAt} - ${bookings.startsAt})) / 3600 * ${HOURLY_RATE_GROSZ}) filter (where ${bookings.status} = 'confirmed'), 0)::int`
            })
            .from(bookings)
            .groupBy(bookings.customerPhone),
          db
            .select({
              phone: bookings.customerPhone,
              foodGrosz: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPriceGrosz}), 0)::int`
            })
            .from(orderItems)
            .innerJoin(bookings, eq(orderItems.bookingId, bookings.id))
            .where(eq(bookings.status, 'confirmed'))
            .groupBy(bookings.customerPhone),
          db
            .selectDistinctOn([bookings.customerPhone], {
              phone: bookings.customerPhone,
              name: bookings.customerName
            })
            .from(bookings)
            .orderBy(bookings.customerPhone, desc(bookings.startsAt))
        ]);

        const foodMap = new Map(foodByPhone.map(f => [f.phone, f.foodGrosz]));
        const nameMap = new Map(latestNames.map(n => [n.phone, n.name]));

        return aggregates
          .map(agg => ({
            phone: agg.phone,
            name: nameMap.get(agg.phone) ?? '',
            bookingsCount: agg.bookingsCount,
            cancelledCount: agg.cancelledCount,
            firstSeen: agg.firstSeen?.toISOString() ?? '',
            lastSeen: agg.lastSeen?.toISOString() ?? '',
            totalSpentGrosz: agg.tableGrosz + (foodMap.get(agg.phone) ?? 0)
          }))
          .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
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
  });
}
