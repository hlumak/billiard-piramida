import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';
import { bookingExtensions, bookingFood, tables, users } from '../schema';

export const bookings = pgTable(
  'bookings',
  {
    id: serial().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tableId: integer('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'restrict' }),
    time: timestamp().notNull(),
    originalDuration: integer('original_duration').notNull(),
    currentDuration: integer('current_duration').notNull(),
    totalPrice: numeric('total_price', { mode: 'number', precision: 7, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    check('bookings_original_duration_check', sql`${table.originalDuration} > 0`),
    check('bookings_current_duration_check', sql`${table.currentDuration} > 0`),
    check(
      'bookings_duration_logic_check',
      sql`${table.currentDuration} >= ${table.originalDuration}`
    ),
    check('bookings_price_check', sql`${table.totalPrice} >= 0`),
    index('bookings_user_id_idx').on(table.userId),
    index('bookings_table_id_idx').on(table.tableId),
    index('bookings_time_idx').on(table.time),
    index('bookings_table_time_idx').on(table.tableId, table.time)
  ]
);

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id]
  }),
  table: one(tables, {
    fields: [bookings.tableId],
    references: [tables.id]
  }),
  bookingFood: many(bookingFood),
  extensions: many(bookingExtensions)
}));
