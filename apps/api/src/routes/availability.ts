import { Type } from '@sinclair/typebox';
import type { AvailabilityDto, TableAvailabilityDto } from '@repo/shared';
import { hoursForDate, isIsoDate, MIN_BOOKING_HOURS } from '@repo/shared';
import { and, eq, gt, lt } from 'drizzle-orm';
import { bookings, tables } from '../db/schema.ts';
import { AVAILABILITY_RESPONSE, ERROR_RESPONSE } from '../lib/schemas.ts';
import { HOUR_MS, warsawInstant } from '../lib/time.ts';
import type { AppInstance } from '../app.ts';

export function availabilityRoutes(app: AppInstance) {
  app.get(
    '/api/availability',
    {
      schema: {
        querystring: Type.Object({
          date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
        }),
        response: { 200: AVAILABILITY_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply): Promise<AvailabilityDto> => {
      const { date } = request.query;
      if (!isIsoDate(date)) {
        return reply.code(400).send({ error: 'invalid_date' });
      }

      const { open, close } = hoursForDate(date);
      const dayStart = warsawInstant(date, open);
      const dayEnd = warsawInstant(date, close);
      const now = new Date();

      const [allTables, dayBookings] = await Promise.all([
        app.db.select().from(tables).orderBy(tables.id),
        app.db
          .select({
            tableId: bookings.tableId,
            startsAt: bookings.startsAt,
            endsAt: bookings.endsAt
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.status, 'confirmed'),
              lt(bookings.startsAt, dayEnd),
              gt(bookings.endsAt, dayStart)
            )
          )
      ]);

      const tableAvailability: TableAvailabilityDto[] = allTables.map(table => {
        const busy = dayBookings.filter(b => b.tableId === table.id);
        const slots = [];
        for (let hour = open; hour <= close - MIN_BOOKING_HOURS; hour++) {
          const slotStart = warsawInstant(date, hour);
          const slotEnd = new Date(slotStart.getTime() + HOUR_MS);
          const overlaps = busy.some(b => b.startsAt < slotEnd && b.endsAt > slotStart);
          const inPast = slotStart.getTime() < now.getTime() - 5 * 60_000;
          slots.push({ hour, available: !overlaps && !inPast });
        }
        return { tableId: table.id, slots };
      });

      return { date, open, close, tables: tableAvailability };
    }
  );
}
