export const MIN_BOOKING_HOURS = 1;
/** Upper bound on a single booking, whatever the day's closing time allows. */
export const MAX_BOOKING_HOURS = 8;
export const VENUE_TIMEZONE = 'Europe/Warsaw';

/** A calendar date in YYYY-MM-DD form — narrow via `isIsoDate`, never cast at call sites. */
export type IsoDate = `${number}-${number}-${number}`;

export interface DayHours {
  /** First bookable hour (local Warsaw time), inclusive */
  open: number;
  /** Closing hour (local Warsaw time) — last booking must end by this hour */
  close: number;
}

/**
 * A full week of opening hours, indexed by JS weekday: 0 = Sunday … 6 = Saturday.
 * Always seven entries, so `hours[weekdayOf(date)]` cannot miss.
 */
export type WeeklyHours = [DayHours, DayHours, DayHours, DayHours, DayHours, DayHours, DayHours];

/**
 * The hours the club opened with. These are only the seed for `venue_hours` and
 * a display-side fallback — the database row is what the API validates against,
 * so staff can move closing time without a deploy.
 */
export const DEFAULT_WEEKLY_HOURS: WeeklyHours = [
  { open: 15, close: 23 }, // Sunday
  { open: 16, close: 21 }, // Monday
  { open: 16, close: 21 }, // Tuesday
  { open: 16, close: 21 }, // Wednesday
  { open: 16, close: 21 }, // Thursday
  { open: 16, close: 23 }, // Friday
  { open: 15, close: 23 } // Saturday
];

const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE_RE.test(value)) return false;
  // The regex allows day 31 for every month, so reject overflow dates
  // (2026-02-31, 2026-04-31, Feb 29 in non-leap years) that would otherwise
  // roll over silently in Date.UTC and land a booking on the wrong day.
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * [year, month (1-based), day] of a YYYY-MM-DD string.
 * Throws on malformed input instead of trusting `!` assertions.
 */
export function dateParts(isoDate: IsoDate): [year: number, month: number, day: number] {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y + m + d)) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return [y, m, d];
}

/**
 * Weekday of a calendar date (timezone-independent: a YYYY-MM-DD names the
 * same weekday everywhere).
 */
export function weekdayOf(isoDate: IsoDate): number {
  const [y, m, d] = dateParts(isoDate);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * `hours` is passed in rather than read from a constant: opening times are
 * staff-editable, and the API loads the live week from the database before
 * validating anything. Callers with nothing better fall back to
 * `DEFAULT_WEEKLY_HOURS`, but never for a decision the server also makes.
 */
export function hoursForDate(isoDate: IsoDate, hours: WeeklyHours): DayHours {
  const day = hours[weekdayOf(isoDate)];
  if (!day) throw new Error(`Invalid date: ${isoDate}`);
  return day;
}

/** Hourly slot start times (local hours) for a given date. */
export function slotStartsForDate(isoDate: IsoDate, hours: WeeklyHours): number[] {
  const { open, close } = hoursForDate(isoDate, hours);
  const starts: number[] = [];
  for (let h = open; h <= close - MIN_BOOKING_HOURS; h++) starts.push(h);
  return starts;
}

/** Longest booking (in hours) that can start at `startHour` on `isoDate`. */
export function maxDurationAt(isoDate: IsoDate, startHour: number, hours: WeeklyHours): number {
  const { open, close } = hoursForDate(isoDate, hours);
  if (startHour < open || startHour > close - MIN_BOOKING_HOURS) return 0;
  return close - startHour;
}

export function isValidBookingWindow(
  isoDate: IsoDate,
  startHour: number,
  durationHours: number,
  hours: WeeklyHours
): boolean {
  if (!Number.isInteger(startHour) || !Number.isInteger(durationHours)) return false;
  if (durationHours < MIN_BOOKING_HOURS) return false;
  return durationHours <= maxDurationAt(isoDate, startHour, hours);
}

/** A day the club does not open at all — `open >= close` leaves no bookable slot. */
export function isClosedAllDay(day: DayHours): boolean {
  return day.open >= day.close;
}
