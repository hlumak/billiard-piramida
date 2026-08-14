import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

export const bookingStatusEnum = pgEnum('booking_status', ['confirmed', 'cancelled']);

export const sportCardTypeEnum = pgEnum('sport_card_type', [
  'multisport',
  'medicover',
  'fitprofit'
]);

export const activityKindEnum = pgEnum('activity_kind', ['billiard', 'darts']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  /** Self-declared; staff verifies the physical card at the reception desk */
  sportCardType: sportCardTypeEnum('sport_card_type'),
  sportCardNumber: text('sport_card_number'),
  /** Club cards are discontinued — no discount, no UI, no longer in the DTO.
   *  The column stays so the numbers survive if the scheme ever comes back. */
  clubCardNumber: text('club_card_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Bookable spots. Still called `tables` because `bookings.table_id` is written
 * into the hand-written overlap EXCLUDE constraint — renaming would mean
 * rebuilding that guard for no functional gain. `kind` carries what the spot is.
 */
export const tables = pgTable('tables', {
  id: integer('id').primaryKey(),
  label: text('label').notNull(),
  kind: activityKindEnum('kind').notNull().default('billiard')
});

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: integer('table_id')
      .notNull()
      .references(() => tables.id),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: bookingStatusEnum('status').notNull().default('confirmed'),
    /** Set when a signed-in client booked — enables history */
    userId: uuid('user_id').references(() => users.id),
    /** Partner sport cards declared for this booking, one per player. Guests
     *  can claim them too — the discount is not tied to an account. */
    sportCardCount: integer('sport_card_count').notNull().default(0),
    discountGrosz: integer('discount_grosz').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    // Hot paths: availability window scan (status, starts_at), phone lookup, and
    // the user-id FK used by history/discount queries.
    index('bookings_status_starts_at_idx').on(t.status, t.startsAt),
    index('bookings_customer_phone_idx').on(t.customerPhone),
    index('bookings_user_id_idx').on(t.userId)
  ]
);

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

/**
 * Home-screen news carousel, managed from the admin panel. Everything
 * locale-independent lives here; the copy is per-locale in
 * `news_item_translations`, same split as food items.
 */
export const newsItems = pgTable(
  'news_items',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Optional illustration: app-relative path or absolute http(s) URL */
    imageUrl: text('image_url'),
    /** Optional target the whole card links to */
    linkUrl: text('link_url'),
    isPublished: boolean('is_published').notNull().default(true),
    /** Staff-controlled carousel position, ascending */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  // The public carousel reads exactly this slice on every home-page render
  t => [index('news_items_published_sort_idx').on(t.isPublished, t.sortOrder)]
);

export const newsItemTranslations = pgTable(
  'news_item_translations',
  {
    newsItemId: integer('news_item_id')
      .notNull()
      .references(() => newsItems.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    body: text('body')
  },
  t => [primaryKey({ columns: [t.newsItemId, t.locale] })]
);

export const orderItems = pgTable(
  'order_items',
  {
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
  },
  // Every DTO load fetches order items by booking_id — avoid the seq scan.
  t => [index('order_items_booking_id_idx').on(t.bookingId)]
);
