import { relations, sql } from 'drizzle-orm';
import {
  check,
  decimal,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core';
import { bookingFood } from '../schema';

export const food = pgTable(
  'food',
  {
    id: serial().primaryKey(),
    name: varchar({ length: 100 }).notNull(),
    price: decimal({ precision: 10, scale: 2 }).notNull(),
    quantity: integer().notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    check('food_price_check', sql`${table.price} > 0`),
    check('food_quantity_check', sql`${table.quantity} >= 0`),
    index('food_name_idx').on(table.name),
    index('food_quantity_idx').on(table.quantity)
  ]
);

export const foodRelations = relations(food, ({ many }) => ({
  bookingFood: many(bookingFood)
}));
