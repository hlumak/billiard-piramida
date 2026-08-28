import { Type, type Static } from '@sinclair/typebox';
import { MAX_HOURLY_RATE_GROSZ } from '@repo/shared';
import type {
  AdminAnalyticsDto,
  AdminCustomerDto,
  AdminMenuItemDto,
  AdminNewsItemDto,
  AdminStatsDto,
  AdminTournamentDto,
  AdminTournamentRegistrationDto,
  AuthResponseDto,
  AvailabilityDto,
  BookingDto,
  IsoDate,
  MenuItemDto,
  NewsItemDto,
  TableDto,
  TournamentDto,
  TournamentRegistrationResultDto,
  UserProfileDto,
  VenueConfigDto
} from '@repo/shared';

/**
 * Response schemas: with these declared, Fastify serializes via compiled
 * fast-json-stringify (2-3x faster than JSON.stringify) and strips any
 * property not on the allowlist. Drift against the @repo/shared DTOs is a
 * compile error — see the guards at the bottom of this file.
 */

/** JSON Schema stays a plain string pattern; the static type is IsoDate. */
export const ISO_DATE = Type.Unsafe<IsoDate>(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }));

export const ERROR_RESPONSE = Type.Object({ error: Type.String() });

export const ACTIVITY_KIND = Type.Union([Type.Literal('billiard'), Type.Literal('darts')]);

export const TABLE_RESPONSE = Type.Object({
  id: Type.Integer(),
  label: Type.String(),
  kind: ACTIVITY_KIND
});

export const AVAILABILITY_RESPONSE = Type.Object({
  date: ISO_DATE,
  open: Type.Integer(),
  close: Type.Integer(),
  tables: Type.Array(
    Type.Object({
      tableId: Type.Integer(),
      kind: ACTIVITY_KIND,
      label: Type.String(),
      slots: Type.Array(
        Type.Object({
          hour: Type.Integer(),
          available: Type.Boolean(),
          booked: Type.Boolean()
        })
      )
    })
  )
});

export const DAY_HOURS = Type.Object({
  open: Type.Integer({ minimum: 0, maximum: 24 }),
  close: Type.Integer({ minimum: 0, maximum: 24 })
});

/** Exactly seven, index = JS weekday, so the tuple mirrors `WeeklyHours`. */
export const WEEKLY_HOURS = Type.Tuple([
  DAY_HOURS,
  DAY_HOURS,
  DAY_HOURS,
  DAY_HOURS,
  DAY_HOURS,
  DAY_HOURS,
  DAY_HOURS
]);

export const RATE_TABLE = Type.Object({
  '9ft': Type.Integer({ minimum: 0, maximum: MAX_HOURLY_RATE_GROSZ }),
  '12ft': Type.Integer({ minimum: 0, maximum: MAX_HOURLY_RATE_GROSZ }),
  darts: Type.Integer({ minimum: 0, maximum: MAX_HOURLY_RATE_GROSZ })
});

export const VENUE_CONFIG_RESPONSE = Type.Object({
  rates: RATE_TABLE,
  hours: WEEKLY_HOURS
});

export const MENU_ITEM_RESPONSE = Type.Object({
  id: Type.Integer(),
  slug: Type.String(),
  category: Type.String(),
  priceGrosz: Type.Integer(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()])
});

export const BOOKING_RESPONSE = Type.Object({
  id: Type.String(),
  tableId: Type.Integer(),
  kind: ACTIVITY_KIND,
  tableLabel: Type.String(),
  customerName: Type.String(),
  customerPhone: Type.String(),
  startsAt: Type.String(),
  endsAt: Type.String(),
  status: Type.Union([Type.Literal('confirmed'), Type.Literal('cancelled')]),
  phase: Type.Union([
    Type.Literal('upcoming'),
    Type.Literal('active'),
    Type.Literal('finished'),
    Type.Literal('cancelled')
  ]),
  items: Type.Array(
    Type.Object({
      id: Type.String(),
      foodItemId: Type.Integer(),
      slug: Type.String(),
      quantity: Type.Integer(),
      unitPriceGrosz: Type.Integer()
    })
  ),
  tableTotalGrosz: Type.Integer(),
  foodTotalGrosz: Type.Integer(),
  sportCardCount: Type.Integer(),
  discountGrosz: Type.Integer(),
  totalGrosz: Type.Integer()
});

export const LOCALE_SCHEMA = Type.Union([
  Type.Literal('uk'),
  Type.Literal('pl'),
  Type.Literal('en')
]);

export const MENU_TRANSLATION = Type.Object({
  locale: LOCALE_SCHEMA,
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()])
});

export const ADMIN_MENU_ITEM_RESPONSE = Type.Object({
  id: Type.Integer(),
  slug: Type.String(),
  category: Type.String(),
  priceGrosz: Type.Integer(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  isAvailable: Type.Boolean(),
  translations: Type.Array(MENU_TRANSLATION)
});

export const NEWS_ITEM_RESPONSE = Type.Object({
  id: Type.Integer(),
  title: Type.String(),
  body: Type.Union([Type.String(), Type.Null()]),
  imageUrl: Type.Union([Type.String(), Type.Null()]),
  linkUrl: Type.Union([Type.String(), Type.Null()])
});

export const NEWS_TRANSLATION = Type.Object({
  locale: LOCALE_SCHEMA,
  title: Type.String(),
  body: Type.Union([Type.String(), Type.Null()])
});

export const ADMIN_NEWS_ITEM_RESPONSE = Type.Object({
  ...NEWS_ITEM_RESPONSE.properties,
  isPublished: Type.Boolean(),
  sortOrder: Type.Integer(),
  translations: Type.Array(NEWS_TRANSLATION)
});

/* Tournaments. The literal unions are spelled out rather than mapped from the
 * shared tuples: TypeBox only carries a precise static type through explicit
 * Type.Literal members, and the drift guards below are what keep them honest. */
export const TOURNAMENT_STATUS = Type.Union([
  Type.Literal('draft'),
  Type.Literal('registration'),
  Type.Literal('closed'),
  Type.Literal('completed'),
  Type.Literal('cancelled')
]);

export const TOURNAMENT_REGISTRATION_STATUS = Type.Union([
  Type.Literal('pending'),
  Type.Literal('confirmed'),
  Type.Literal('cancelled')
]);

export const TOURNAMENT_REGISTRATION_STATE = Type.Union([
  Type.Literal('open'),
  Type.Literal('full'),
  Type.Literal('deadline_passed'),
  Type.Literal('closed'),
  Type.Literal('completed'),
  Type.Literal('cancelled')
]);

export const TOURNAMENT_RESPONSE = Type.Object({
  id: Type.Integer(),
  slug: Type.String(),
  title: Type.String(),
  summary: Type.Union([Type.String(), Type.Null()]),
  details: Type.Union([Type.String(), Type.Null()]),
  imageUrl: Type.Union([Type.String(), Type.Null()]),
  status: TOURNAMENT_STATUS,
  startsOn: Type.Union([ISO_DATE, Type.Null()]),
  startHour: Type.Union([Type.Integer(), Type.Null()]),
  registrationDeadline: Type.Union([ISO_DATE, Type.Null()]),
  entryFeeGrosz: Type.Union([Type.Integer(), Type.Null()]),
  minPlayers: Type.Integer(),
  maxPlayers: Type.Union([Type.Integer(), Type.Null()]),
  confirmedCount: Type.Integer(),
  pendingCount: Type.Integer(),
  registrationState: TOURNAMENT_REGISTRATION_STATE
});

export const TOURNAMENT_REGISTRATION_RESULT = Type.Object({
  status: TOURNAMENT_REGISTRATION_STATUS,
  tournament: TOURNAMENT_RESPONSE
});

export const TOURNAMENT_TRANSLATION = Type.Object({
  locale: LOCALE_SCHEMA,
  title: Type.String(),
  summary: Type.Union([Type.String(), Type.Null()]),
  details: Type.Union([Type.String(), Type.Null()])
});

export const ADMIN_TOURNAMENT_RESPONSE = Type.Object({
  ...TOURNAMENT_RESPONSE.properties,
  translations: Type.Array(TOURNAMENT_TRANSLATION)
});

/** Names and phones live here and nowhere else — the public DTO carries counts only. */
export const ADMIN_TOURNAMENT_REGISTRATION_RESPONSE = Type.Object({
  id: Type.String(),
  tournamentId: Type.Integer(),
  name: Type.String(),
  phone: Type.String(),
  status: TOURNAMENT_REGISTRATION_STATUS,
  userId: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String()
});

export const ADMIN_ANALYTICS_RESPONSE = Type.Object({
  days: Type.Integer(),
  daily: Type.Array(
    Type.Object({
      date: ISO_DATE,
      bookings: Type.Integer(),
      revenueGrosz: Type.Integer()
    })
  ),
  tables: Type.Array(
    Type.Object({
      tableId: Type.Integer(),
      bookedHours: Type.Number(),
      openHours: Type.Number()
    })
  ),
  startHours: Type.Array(
    Type.Object({
      hour: Type.Integer(),
      bookings: Type.Integer()
    })
  )
});

export const SPORT_CARD_TYPE = Type.Union([
  Type.Literal('multisport'),
  Type.Literal('medicover'),
  Type.Literal('fitprofit')
]);

export const PROFILE_RESPONSE = Type.Object({
  id: Type.String(),
  phone: Type.String(),
  name: Type.String(),
  sportCardType: Type.Union([SPORT_CARD_TYPE, Type.Null()]),
  sportCardNumber: Type.Union([Type.String(), Type.Null()])
});

export const AUTH_RESPONSE = Type.Object({
  token: Type.String(),
  profile: PROFILE_RESPONSE
});

export const ADMIN_CUSTOMER_RESPONSE = Type.Object({
  phone: Type.String(),
  name: Type.String(),
  bookingsCount: Type.Integer(),
  cancelledCount: Type.Integer(),
  firstSeen: Type.String(),
  lastSeen: Type.String(),
  totalSpentGrosz: Type.Integer()
});

export const ADMIN_STATS_RESPONSE = Type.Object({
  date: ISO_DATE,
  todayBookings: Type.Integer(),
  activeNow: Type.Integer(),
  upcomingToday: Type.Integer(),
  todayRevenueGrosz: Type.Integer(),
  weekRevenueGrosz: Type.Integer(),
  topItems: Type.Array(
    Type.Object({
      foodItemId: Type.Integer(),
      slug: Type.String(),
      totalQuantity: Type.Integer()
    })
  )
});

/* Compile-time drift guards: each schema's static type must be mutually
 * assignable with its shared DTO, so editing one without the other fails. */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

export type SchemaDriftChecks = [
  Expect<Equals<Static<typeof TABLE_RESPONSE>, TableDto>>,
  Expect<Equals<Static<typeof AVAILABILITY_RESPONSE>, AvailabilityDto>>,
  Expect<Equals<Static<typeof MENU_ITEM_RESPONSE>, MenuItemDto>>,
  Expect<Equals<Static<typeof BOOKING_RESPONSE>, BookingDto>>,
  Expect<Equals<Static<typeof ADMIN_CUSTOMER_RESPONSE>, AdminCustomerDto>>,
  Expect<Equals<Static<typeof ADMIN_STATS_RESPONSE>, AdminStatsDto>>,
  Expect<Equals<Static<typeof PROFILE_RESPONSE>, UserProfileDto>>,
  Expect<Equals<Static<typeof AUTH_RESPONSE>, AuthResponseDto>>,
  Expect<Equals<Static<typeof ADMIN_ANALYTICS_RESPONSE>, AdminAnalyticsDto>>,
  Expect<Equals<Static<typeof ADMIN_MENU_ITEM_RESPONSE>, AdminMenuItemDto>>,
  Expect<Equals<Static<typeof NEWS_ITEM_RESPONSE>, NewsItemDto>>,
  Expect<Equals<Static<typeof ADMIN_NEWS_ITEM_RESPONSE>, AdminNewsItemDto>>,
  Expect<Equals<Static<typeof VENUE_CONFIG_RESPONSE>, VenueConfigDto>>,
  Expect<Equals<Static<typeof TOURNAMENT_RESPONSE>, TournamentDto>>,
  Expect<Equals<Static<typeof TOURNAMENT_REGISTRATION_RESULT>, TournamentRegistrationResultDto>>,
  Expect<Equals<Static<typeof ADMIN_TOURNAMENT_RESPONSE>, AdminTournamentDto>>,
  Expect<
    Equals<Static<typeof ADMIN_TOURNAMENT_REGISTRATION_RESPONSE>, AdminTournamentRegistrationDto>
  >
];
