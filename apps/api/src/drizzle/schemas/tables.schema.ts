import { relations, sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, serial } from 'drizzle-orm/pg-core';
import { bookings } from '../schema';

export const tables = pgTable(
  'tables',
  {
    id: serial().primaryKey(),
    number: integer().notNull().unique(),
    isActive: boolean('is_active').notNull().default(true)
  },
  table => [check('tables_number_check', sql`${table.number} > 0`)]
);

export const tablesRelations = relations(tables, ({ many }) => ({
  bookings: many(bookings)
}));
