import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { TOURNAMENT_REGISTRATION_STATUSES, TOURNAMENT_STATUSES } from '@repo/shared';

export const bookingStatusEnum = pgEnum('booking_status', ['confirmed', 'cancelled']);

export const sportCardTypeEnum = pgEnum('sport_card_type', [
  'multisport',
  'medicover',
  'fitprofit'
]);

export const activityKindEnum = pgEnum('activity_kind', ['billiard', 'darts']);

/** Which cue game a billiard rental is racked for — see `games` on SpotDef. */
export const billiardGameEnum = pgEnum('billiard_game', ['pool', 'piramida']);

/** Both tournament enums are built from the shared literal tuples, so a new
 *  status is one edit in @repo/shared rather than three that can drift. */
export const tournamentStatusEnum = pgEnum('tournament_status', TOURNAMENT_STATUSES);

export const tournamentRegistrationStatusEnum = pgEnum(
  'tournament_registration_status',
  TOURNAMENT_REGISTRATION_STATUSES
);

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
    /** Null on a dartboard, and on the billiard rentals written before the club
     *  started asking — deliberately not backfilled to 'piramida', which would
     *  invent a fact about games nobody recorded. */
    game: billiardGameEnum('game'),
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
    /** Rate locked in when the booking was written, exactly like an order
     *  line's unit price: repricing the club must not rewrite old receipts. */
    hourlyRateGrosz: integer('hourly_rate_grosz').notNull(),
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

/**
 * Hourly rate per tier, staff-editable. Three rows, keyed by the shared
 * `RateTier` ('9ft' | '12ft' | 'darts') — a text key rather than an enum so a
 * new cloth size is a seed row, not a migration plus a deploy.
 */
export const venueRates = pgTable('venue_rates', {
  tier: text('tier').primaryKey(),
  hourlyGrosz: integer('hourly_grosz').notNull()
});

/**
 * Opening hours, one row per weekday (0 = Sunday … 6 = Saturday). A day with
 * `opens >= closes` is shut: no slot survives the window arithmetic.
 */
export const venueHours = pgTable('venue_hours', {
  weekday: integer('weekday').primaryKey(),
  opens: integer('opens').notNull(),
  closes: integer('closes').notNull()
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

/**
 * Home-screen news carousel, managed from the admin panel. Everything
 * locale-independent lives here; the copy is per-locale in
 * `news_item_translations`, same split as food items.
 */
export const newsItems = pgTable(
  'news_items',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** URL key of the item's own page — /news/:slug; stable once published */
    slug: text('slug').notNull().unique(),
    /** Optional illustration (also the article's cover): app-relative path or http(s) URL */
    imageUrl: text('image_url'),
    /** Optional target the card links to instead of its own page */
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
    /** One-line teaser for the carousel card */
    body: text('body'),
    /** Full article for /news/:slug in the light markup `parseArticle` reads; null = card only */
    content: text('content')
  },
  t => [primaryKey({ columns: [t.newsItemId, t.locale] })]
);

/**
 * Club tournaments. Dates are stored as venue-local calendar values, not
 * instants: the rest of the app already speaks Warsaw wall clock (see
 * `hoursForDate`), and an announced tournament often has no date at all until
 * the roster fills — `starts_on` stays null until it does.
 */
export const tournaments = pgTable(
  'tournaments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** URL key, stable once announced — /tournaments/:slug */
    slug: text('slug').notNull().unique(),
    startsOn: date('starts_on'),
    /** Venue-local start hour, same convention as a booking slot */
    startHour: integer('start_hour'),
    /** Last day sign-ups are accepted, inclusive */
    registrationDeadline: date('registration_deadline'),
    /** Paid in person at the reception desk — the site never takes money */
    entryFeeGrosz: integer('entry_fee_grosz'),
    /** Players needed before the bracket is played; 0 = no threshold */
    minPlayers: integer('min_players').notNull().default(0),
    /** Hard cap on the roster; null = uncapped */
    maxPlayers: integer('max_players'),
    status: tournamentStatusEnum('status').notNull().default('draft'),
    /** Optional poster: app-relative path or absolute http(s) URL */
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  // The public list reads exactly this slice: everything but drafts, soonest first
  t => [index('tournaments_status_starts_on_idx').on(t.status, t.startsOn)]
);

export const tournamentTranslations = pgTable(
  'tournament_translations',
  {
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    details: text('details')
  },
  t => [primaryKey({ columns: [t.tournamentId, t.locale] })]
);

/**
 * One seat on a tournament roster. Accounts stay optional throughout the app, so
 * the phone — not a user id — is the identity of a sign-up, and the unique index
 * on (tournament, phone) is what stops one player taking two seats. `user_id` is
 * filled in opportunistically when a signed-in customer registers.
 */
export const tournamentRegistrations = pgTable(
  'tournament_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Normalized to E.164 on write, like every other phone in the schema */
    phone: text('phone').notNull(),
    userId: uuid('user_id').references(() => users.id),
    /** pending until staff take the entry fee at the reception desk */
    status: tournamentRegistrationStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    uniqueIndex('tournament_registrations_tournament_phone_idx').on(t.tournamentId, t.phone),
    // Seat counts group by exactly this pair on every tournament read
    index('tournament_registrations_tournament_status_idx').on(t.tournamentId, t.status)
  ]
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
