import { Type } from 'typebox';
import type { AvailabilityDto, TableAvailabilityDto } from '@repo/shared';
import { hoursForDate, isIsoDate, MAX_BOOKING_MINUTES, SLOT_MINUTES } from '@repo/shared';
import { and, eq, gt, gte, lt } from 'drizzle-orm';
import { bookings, tables } from '../db/schema.ts';
import { AVAILABILITY_RESPONSE, ERROR_RESPONSE } from '../lib/schemas.ts';
import { loadClosuresBetween } from '../services/closures.ts';
import { MINUTE_MS, warsawInstantAt } from '../lib/time.ts';
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

      const { open, close } = hoursForDate(date, (await app.venueConfig.get()).hours);
      // close may be past midnight (25 = 01:00 the next morning)
      const dayStart = warsawInstantAt(date, open * 60);
      const dayEnd = warsawInstantAt(date, close * 60);
      const now = new Date();

      const [allTables, dayBookings, dayClosures] = await Promise.all([
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
              // Nothing longer than the longest booking can reach into the day
              // from before it: this lower bound lets the (status, starts_at)
              // index scan one day instead of all history
              gte(
                bookings.startsAt,
                new Date(dayStart.getTime() - MAX_BOOKING_MINUTES * MINUTE_MS)
              ),
              lt(bookings.startsAt, dayEnd),
              gt(bookings.endsAt, dayStart)
            )
          ),
        loadClosuresBetween(app.db, dayStart, dayEnd)
      ]);

      const tableAvailability: TableAvailabilityDto[] = allTables.map(table => {
        const busy = dayBookings.filter(b => b.tableId === table.id);
        const shut = dayClosures.filter(c => c.tableIds === null || c.tableIds.includes(table.id));
        const slots = [];
        // Every half hour the club is open, the last one included: a
        // booking cannot start there (under the 1-hour minimum), but whether
        // it is free decides if a 1:30 fits before closing
        for (let startMinute = open * 60; startMinute < close * 60; startMinute += SLOT_MINUTES) {
          const slotStart = warsawInstantAt(date, startMinute);
          const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * MINUTE_MS);
          const overlaps = busy.some(b => b.startsAt < slotEnd && b.endsAt > slotStart);
          const closed = shut.some(c => c.startsAt < slotEnd && c.endsAt > slotStart);
          const inPast = slotStart.getTime() < now.getTime() - 5 * 60_000;
          // `booked` = taken (staff can still log past-but-free slots today);
          // `available` also excludes past slots for the public wizard.
          slots.push({
            startMinute,
            available: !overlaps && !inPast && !closed,
            booked: overlaps,
            closed
          });
        }
        return { tableId: table.id, kind: table.kind, label: table.label, slots };
      });

      return { date, open, close, tables: tableAvailability };
    }
  );
}
