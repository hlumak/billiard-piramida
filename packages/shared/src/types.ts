import type { Locale } from './locales.ts';
import type { IsoDate } from './schedule.ts';

export type BookingStatus = 'confirmed' | 'cancelled';

/** Derived from status + current time; never stored. */
export type BookingPhase = 'upcoming' | 'active' | 'finished' | 'cancelled';

/** What a spot is booked for — picks the hourly rate and how it's labelled. */
export type ActivityKind = 'billiard' | 'darts';

/**
 * A bookable spot: a billiard table or a dartboard. Still named "table"
 * throughout the DB and the DTOs — `bookings.table_id` is load-bearing for the
 * hand-written overlap EXCLUDE constraint, so the column keeps its name and
 * `kind` carries the distinction.
 */
export interface TableDto {
  id: number;
  label: string;
  kind: ActivityKind;
}

export interface SlotDto {
  /** Local Warsaw hour, e.g. 16 for 16:00 */
  hour: number;
  /** Bookable by the public: not taken AND not in the past. */
  available: boolean;
  /** Occupied by a confirmed booking, regardless of pastness. Lets staff log
   *  walk-in games that already started today (which `available` hides). */
  booked: boolean;
}

export interface TableAvailabilityDto {
  tableId: TableDto['id'];
  kind: ActivityKind;
  label: TableDto['label'];
  slots: SlotDto[];
}

export interface AvailabilityDto {
  date: IsoDate;
  open: number;
  close: number;
  tables: TableAvailabilityDto[];
}

export interface MenuItemDto {
  id: number;
  slug: string;
  category: string;
  priceGrosz: number;
  name: string;
  description: string | null;
}

export interface OrderItemDto {
  id: string;
  foodItemId: MenuItemDto['id'];
  slug: MenuItemDto['slug'];
  quantity: number;
  unitPriceGrosz: number;
}

export interface BookingDto {
  id: string;
  tableId: TableDto['id'];
  kind: ActivityKind;
  /** Number within the kind ("Table 3", "Dartboard 1") — not the global id */
  tableLabel: TableDto['label'];
  customerName: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  phase: BookingPhase;
  items: OrderItemDto[];
  /** Rental of the booked spot — billiard table or dartboard */
  tableTotalGrosz: number;
  foodTotalGrosz: number;
  /** Partner sport cards declared at booking time, one per player */
  sportCardCount: number;
  /** Sport-card discount locked in at booking time */
  discountGrosz: number;
  totalGrosz: number;
}

export type SportCardType = 'multisport' | 'medicover' | 'fitprofit';

export interface UserProfileDto {
  id: string;
  phone: string;
  name: string;
  sportCardType: SportCardType | null;
  sportCardNumber: string | null;
}

export interface AuthResponseDto {
  token: string;
  profile: UserProfileDto;
}

/** Derived from the DTOs (Pick, not re-declared) so drift breaks the build. */
export interface NewOrderItem extends Pick<OrderItemDto, 'foodItemId' | 'quantity'> {}

/** A customer aggregated from their bookings — there are no accounts, phone is the key. */
export interface AdminCustomerDto {
  phone: BookingDto['customerPhone'];
  /** Name from the most recent booking */
  name: BookingDto['customerName'];
  bookingsCount: number;
  cancelledCount: number;
  firstSeen: string;
  lastSeen: string;
  /** Table rental + food across confirmed bookings */
  totalSpentGrosz: number;
}

export interface AdminTopItemDto {
  foodItemId: MenuItemDto['id'];
  slug: MenuItemDto['slug'];
  totalQuantity: number;
}

export interface MenuTranslationDto {
  locale: Locale;
  name: string;
  description: string | null;
}

/** Menu row for staff: includes hidden items (uk display name) + all translations. */
export interface AdminMenuItemDto extends MenuItemDto {
  isAvailable: boolean;
  translations: MenuTranslationDto[];
}

/** One card of the home-screen carousel, already resolved to a single locale. */
export interface NewsItemDto {
  id: number;
  title: string;
  body: string | null;
  /** App-relative path or absolute http(s) URL — see `isSafeUrl` */
  imageUrl: string | null;
  linkUrl: string | null;
}

export interface NewsTranslationDto {
  locale: Locale;
  title: string;
  body: string | null;
}

/** News row for staff: includes hidden items (uk display copy) + all translations. */
export interface AdminNewsItemDto extends NewsItemDto {
  isPublished: boolean;
  /** Ascending carousel position; ties break by newest first. */
  sortOrder: number;
  translations: NewsTranslationDto[];
}

export interface AdminDailyStatDto {
  date: IsoDate;
  bookings: number;
  /** Net revenue: table rental + food − discounts, confirmed bookings only */
  revenueGrosz: number;
}

export interface AdminTableUtilizationDto {
  tableId: TableDto['id'];
  bookedHours: number;
  openHours: number;
}

export interface AdminStartHourDto {
  hour: number;
  bookings: number;
}

export interface AdminAnalyticsDto {
  days: number;
  daily: AdminDailyStatDto[];
  tables: AdminTableUtilizationDto[];
  startHours: AdminStartHourDto[];
}

export interface AdminStatsDto {
  date: IsoDate;
  todayBookings: number;
  activeNow: number;
  upcomingToday: number;
  todayRevenueGrosz: number;
  /** Rolling 7 days ending today (venue timezone) */
  weekRevenueGrosz: number;
  /** Most ordered food over the last 30 days */
  topItems: AdminTopItemDto[];
}

export interface CreateBookingInput {
  tableId: TableDto['id'];
  date: IsoDate;
  startHour: number;
  durationHours: number;
  customerName: BookingDto['customerName'];
  customerPhone: BookingDto['customerPhone'];
  /** Self-declared, guests included — staff verify the physical cards on site */
  sportCardCount?: number;
  items?: NewOrderItem[];
}
