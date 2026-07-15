import { Type, type Static } from '@sinclair/typebox';
import type {
  AdminAnalyticsDto,
  AdminCustomerDto,
  AdminMenuItemDto,
  AdminStatsDto,
  AuthResponseDto,
  AvailabilityDto,
  BookingDto,
  IsoDate,
  MenuItemDto,
  TableDto,
  UserProfileDto
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

export const TABLE_RESPONSE = Type.Object({
  id: Type.Integer(),
  label: Type.String()
});

export const AVAILABILITY_RESPONSE = Type.Object({
  date: ISO_DATE,
  open: Type.Integer(),
  close: Type.Integer(),
  tables: Type.Array(
    Type.Object({
      tableId: Type.Integer(),
      slots: Type.Array(
        Type.Object({
          hour: Type.Integer(),
          available: Type.Boolean()
        })
      )
    })
  )
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
  sportCardNumber: Type.Union([Type.String(), Type.Null()]),
  clubCardNumber: Type.Union([Type.String(), Type.Null()])
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
  Expect<Equals<Static<typeof ADMIN_MENU_ITEM_RESPONSE>, AdminMenuItemDto>>
];
