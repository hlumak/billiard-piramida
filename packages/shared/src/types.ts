import type { Locale } from './locales.ts';
import type { RateTable } from './pricing.ts';
import type { IsoDate, WeeklyHours } from './schedule.ts';
import type {
  TournamentRegistrationState,
  TournamentRegistrationStatus,
  TournamentStatus
} from './tournaments.ts';

export type BookingStatus = 'confirmed' | 'cancelled';

/** Derived from status + current time; never stored. */
export type BookingPhase = 'upcoming' | 'active' | 'finished' | 'cancelled';

/** What a spot is booked for — picks the hourly rate and how it's labelled. */
export type ActivityKind = 'billiard' | 'darts';

/**
 * Cue game a billiard table is racked for. Which games a table can host is a
 * property of the table, not of the booking — see `games` on SpotDef: the 9ft
 * tables in hall 1 take either, the 12ft ones in hall 2 are pyramid-only.
 * Booked per rental so staff know which balls to set out; it does not move the
 * price, which follows cloth size alone.
 */
export type BilliardGame = 'pool' | 'piramida';

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

/**
 * What the club charges and when it is open — staff-editable, so every screen
 * and every server-side check reads it from here rather than from a constant.
 * Booked rentals are unaffected by a later change: the hourly rate is locked
 * onto the booking when it is written, the way a dish keeps its unit price.
 */
export interface VenueConfigDto {
  rates: RateTable;
  /** Seven days, index = JS weekday (0 = Sunday … 6 = Saturday) */
  hours: WeeklyHours;
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
  /** Null on a dartboard, and on billiard bookings taken before the club
   *  started asking — never assume "no game" means pool. */
  game: BilliardGame | null;
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

/**
 * A club tournament, already resolved to a single locale. Dates are venue-local
 * calendar values rather than instants: the whole app speaks Warsaw wall clock
 * (see `hoursForDate`), and a tournament whose date is still unknown has none.
 */
export interface TournamentDto {
  id: number;
  /** URL key — /tournaments/:slug */
  slug: string;
  title: string;
  /** One-line pitch for the carousel and the list page */
  summary: string | null;
  /** Full announcement: format, rules, prizes */
  details: string | null;
  imageUrl: string | null;
  status: TournamentStatus;
  /** null while the date depends on filling the roster */
  startsOn: IsoDate | null;
  /** Venue-local start hour (18 = 18:00); null when only the date is settled */
  startHour: number | null;
  /** Last day sign-ups are accepted, inclusive */
  registrationDeadline: IsoDate | null;
  /** Paid at the reception desk; null when the club has not priced it yet */
  entryFeeGrosz: number | null;
  /** Players needed before the bracket is played; 0 = no threshold */
  minPlayers: number;
  /** Hard cap on the roster; null = uncapped */
  maxPlayers: number | null;
  /** Fee paid at the reception desk */
  confirmedCount: number;
  /** Signed up online, fee not paid yet */
  pendingCount: number;
  /** Derived from status + deadline + capacity — see `registrationStateOf` */
  registrationState: TournamentRegistrationState;
}

/** What a visitor submits to hold a seat. */
export interface TournamentRegistrationInput {
  name: string;
  /** Any format libphonenumber accepts; stored normalized to E.164 */
  phone: string;
}

/** The seat that was just taken, plus the tournament with its counters refreshed. */
export interface TournamentRegistrationResultDto {
  status: TournamentRegistrationStatus;
  tournament: TournamentDto;
}

export interface TournamentTranslationDto {
  locale: Locale;
  title: string;
  summary: string | null;
  details: string | null;
}

/** Tournament row for staff: includes drafts (uk display copy) + all translations. */
export interface AdminTournamentDto extends TournamentDto {
  translations: TournamentTranslationDto[];
}

/** One roster entry, staff view — the only place sign-up names and phones appear. */
export interface AdminTournamentRegistrationDto {
  id: string;
  tournamentId: TournamentDto['id'];
  name: string;
  phone: string;
  status: TournamentRegistrationStatus;
  /** Set when a signed-in customer registered — sign-ups do not require an account */
  userId: string | null;
  createdAt: string;
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
  /** Omitted on a dartboard; omitted on a billiard table it defaults to the
   *  spot's first offered game (pyramid everywhere today). */
  game?: BilliardGame;
}
