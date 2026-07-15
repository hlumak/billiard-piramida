export const TABLES_COUNT = 5;
export const MIN_BOOKING_HOURS = 1;
export const VENUE_TIMEZONE = 'Europe/Warsaw';

/** A calendar date in YYYY-MM-DD form — narrow via `isIsoDate`, never cast at call sites. */
export type IsoDate = `${number}-${number}-${number}`;

export interface DayHours {
  /** First bookable hour (local Warsaw time), inclusive */
  open: number;
  /** Closing hour (local Warsaw time) — last booking must end by this hour */
  close: number;
}

/** Keyed by JS weekday: 0 = Sunday … 6 = Saturday */
const OPERATING_HOURS = [
  { open: 15, close: 23 }, // Sunday
  { open: 16, close: 21 }, // Monday
  { open: 16, close: 21 }, // Tuesday
  { open: 16, close: 21 }, // Wednesday
  { open: 16, close: 21 }, // Thursday
  { open: 16, close: 23 }, // Friday
  { open: 15, close: 23 } // Saturday
] as const satisfies readonly DayHours[];

const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isIsoDate(value: string): value is IsoDate {
  return ISO_DATE_RE.test(value);
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

export function hoursForDate(isoDate: IsoDate): DayHours {
  const hours = OPERATING_HOURS[weekdayOf(isoDate)];
  if (!hours) throw new Error(`Invalid date: ${isoDate}`);
  return hours;
}

/** Hourly slot start times (local hours) for a given date. */
export function slotStartsForDate(isoDate: IsoDate): number[] {
  const { open, close } = hoursForDate(isoDate);
  const starts: number[] = [];
  for (let h = open; h <= close - MIN_BOOKING_HOURS; h++) starts.push(h);
  return starts;
}

/** Longest booking (in hours) that can start at `startHour` on `isoDate`. */
export function maxDurationAt(isoDate: IsoDate, startHour: number): number {
  const { open, close } = hoursForDate(isoDate);
  if (startHour < open || startHour > close - MIN_BOOKING_HOURS) return 0;
  return close - startHour;
}

export function isValidBookingWindow(
  isoDate: IsoDate,
  startHour: number,
  durationHours: number
): boolean {
  if (!Number.isInteger(startHour) || !Number.isInteger(durationHours)) return false;
  if (durationHours < MIN_BOOKING_HOURS) return false;
  return durationHours <= maxDurationAt(isoDate, startHour);
}
