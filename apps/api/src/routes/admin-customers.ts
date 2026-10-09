import { Type } from 'typebox';
import { type AdminCustomerDto } from '@repo/shared';
import { and, count, desc, eq, ilike, inArray, max, min, sql } from 'drizzle-orm';
import { bookings, orderItems } from '../db/schema.ts';
import { ADMIN_CUSTOMER_RESPONSE, PG_INT_MAX } from '../lib/schemas.ts';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

/**
 * Customers, derived from bookings by phone: the paged, searchable list.
 * Registered inside the admin scope (routes/admin.ts), behind its token hook.
 */
export const adminCustomerRoutes: FastifyPluginAsyncTypebox = async admin => {
  admin.get(
    '/api/admin/customers',
    {
      schema: {
        querystring: Type.Object(
          {
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
            offset: Type.Optional(Type.Integer({ minimum: 0, maximum: PG_INT_MAX })),
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
          // Net of sport-card discounts, the same figure /stats and /analytics report
          tableGrosz: sql<number>`coalesce(sum(extract(epoch from (${bookings.endsAt} - ${bookings.startsAt})) / 3600 * ${bookings.hourlyRateGrosz} - ${bookings.discountGrosz}) filter (where ${bookings.status} = 'confirmed'), 0)::int`
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
};
