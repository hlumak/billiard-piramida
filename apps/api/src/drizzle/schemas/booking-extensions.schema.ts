import { relations, sql } from 'drizzle-orm';
import { check, decimal, index, integer, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
import { bookings } from '../schema';

export const bookingExtensions = pgTable(
  'booking_extensions',
  {
    id: serial().primaryKey(),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    extensionDuration: integer('extension_duration').notNull(),
    extensionPrice: decimal('extension_price', { precision: 10, scale: 2 }).notNull(),
    extendedAt: timestamp('extended_at').notNull().defaultNow()
  },
  table => [
    check('booking_extensions_duration_check', sql`${table.extensionDuration} > 0`),
    check('booking_extensions_price_check', sql`${table.extensionPrice} >= 0`),
    index('booking_extensions_booking_id_idx').on(table.bookingId),
    index('booking_extensions_extended_at_idx').on(table.extendedAt)
  ]
);

export const bookingExtensionsRelations = relations(bookingExtensions, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingExtensions.bookingId],
    references: [bookings.id]
  })
}));
