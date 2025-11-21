import { relations, sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, serial } from 'drizzle-orm/pg-core';
import { bookingExtensions, bookings } from '../schema';

export const tables = pgTable(
  'tables',
  {
    id: serial().primaryKey(),
    tableNumber: integer('table_number').notNull().unique(),
    isActive: boolean('is_active').notNull().default(true)
  },
  table => [check('tables_number_check', sql`${table.tableNumber} > 0`)]
);

export const tablesRelations = relations(tables, ({ many }) => ({
  bookings: many(bookings),
  extensionsAsOldTable: many(bookingExtensions, { relationName: 'oldTable' }),
  extensionsAsNewTable: many(bookingExtensions, { relationName: 'newTable' })
}));
