import { relations, sql } from 'drizzle-orm';
import { check, index, integer, numeric, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
import { bookings, tables } from '../schema';

export const bookingExtensions = pgTable(
  'booking_extensions',
  {
    id: serial().primaryKey(),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    extensionDuration: integer('extension_duration').notNull(),
    extensionPrice: numeric('extension_price', {
      mode: 'number',
      precision: 7,
      scale: 2
    }).notNull(),
    oldTableId: integer('old_table_id')
      .notNull()
      .references(() => tables.id),
    newTableId: integer('new_table_id')
      .notNull()
      .references(() => tables.id),
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
  }),
  oldTable: one(tables, {
    fields: [bookingExtensions.oldTableId],
    references: [tables.id],
    relationName: 'oldTable'
  }),
  newTable: one(tables, {
    fields: [bookingExtensions.newTableId],
    references: [tables.id],
    relationName: 'newTable'
  })
}));
