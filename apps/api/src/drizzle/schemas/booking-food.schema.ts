import { relations, sql } from 'drizzle-orm';
import { check, index, integer, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { bookings, food } from '../schema';

export const bookingFood = pgTable(
  'booking_food',
  {
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    foodId: integer('food_id')
      .notNull()
      .references(() => food.id, { onDelete: 'restrict' }),
    quantity: integer().notNull().default(1)
  },
  table => [
    primaryKey({ columns: [table.bookingId, table.foodId] }),
    check('booking_food_quantity_check', sql`${table.quantity} > 0`),
    index('booking_food_booking_id_idx').on(table.bookingId),
    index('booking_food_food_id_idx').on(table.foodId)
  ]
);

export const bookingFoodRelations = relations(bookingFood, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingFood.bookingId],
    references: [bookings.id]
  }),
  food: one(food, {
    fields: [bookingFood.foodId],
    references: [food.id]
  })
}));
