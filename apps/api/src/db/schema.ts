import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

export const bookingStatusEnum = pgEnum('booking_status', ['confirmed', 'cancelled']);

export const tables = pgTable('tables', {
  id: integer('id').primaryKey(),
  label: text('label').notNull()
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: integer('table_id')
    .notNull()
    .references(() => tables.id),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: bookingStatusEnum('status').notNull().default('confirmed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const foodItems = pgTable('food_items', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  category: text('category').notNull(),
  priceGrosz: integer('price_grosz').notNull(),
  isAvailable: boolean('is_available').notNull().default(true)
});

export const foodItemTranslations = pgTable(
  'food_item_translations',
  {
    foodItemId: integer('food_item_id')
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    description: text('description')
  },
  t => [primaryKey({ columns: [t.foodItemId, t.locale] })]
);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  foodItemId: integer('food_item_id')
    .notNull()
    .references(() => foodItems.id),
  quantity: integer('quantity').notNull(),
  unitPriceGrosz: integer('unit_price_grosz').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
