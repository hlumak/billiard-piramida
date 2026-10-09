import { dateParts, VENUE_TIMEZONE, type IsoDate } from '@repo/shared';
import { getLocale } from '../paraglide/runtime.js';

const INTL_TAGS = { uk: 'uk-UA', pl: 'pl-PL', en: 'en-GB' } as const;

export function intlTag(): string {
  return INTL_TAGS[getLocale()];
}

/** Intl formatters are expensive to construct — build each variant once. */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatterCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, cached);
  }
  return cached;
}

/** Today's date (YYYY-MM-DD) in the venue's timezone. */
export function warsawToday(at: number = Date.now()): IsoDate {
  // en-CA short style is defined as YYYY-MM-DD
  return formatter('en-CA', { timeZone: VENUE_TIMEZONE, dateStyle: 'short' }).format(
    new Date(at)
  ) as IsoDate;
}

export { addDays } from '@repo/shared';

function utcDate(isoDate: IsoDate): Date {
  const [y, m, d] = dateParts(isoDate);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "чт, 17 лип." — weekday + day + month for a YYYY-MM-DD, locale-aware. */
export function formatDay(isoDate: IsoDate): string {
  return formatter(intlTag(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(utcDate(isoDate));
}

/** Full date for summaries, e.g. "четвер, 17 липня". */
export function formatDayLong(isoDate: IsoDate): string {
  return formatter(intlTag(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(utcDate(isoDate));
}

/** Localized weekday name for a JS weekday index (0 = Sunday). */
export function weekdayName(weekday: number, style: 'long' | 'short' = 'long'): string {
  // 2026-03-01 was a Sunday, so adding the index lands on the wanted weekday
  const date = new Date(Date.UTC(2026, 2, 1 + weekday));
  return formatter(intlTag(), { weekday: style, timeZone: 'UTC' }).format(date);
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Local Warsaw wall-clock "HH:MM" of an instant. */
export function warsawTime(instant: string | Date): string {
  return formatter('en-GB', {
    timeZone: VENUE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(instant));
}

/** Warsaw calendar date (YYYY-MM-DD) of an instant. */
export function warsawDate(instant: string | Date): IsoDate {
  return formatter('en-CA', { timeZone: VENUE_TIMEZONE, dateStyle: 'short' }).format(
    new Date(instant)
  ) as IsoDate;
}

/**
 * Venue-local start and end hour of a booking, on one scale: a booking ending
 * at midnight ends at 24. `warsawHour(endsAt)` reads that as 0, which made a
 * 22–24 booking look like it ended before it began. Bookings are whole hours
 * and never cross midnight, so start hour + duration is exact.
 */
export function bookingHours(booking: { startsAt: string; endsAt: string }): {
  start: number;
  end: number;
} {
  const start = warsawHour(booking.startsAt);
  const duration = Math.round(
    (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 3_600_000
  );
  return { start, end: start + duration };
}

/** Warsaw wall-clock hour (0–23) of an instant. */
export function warsawHour(instant: string | number | Date): number {
  return Number(
    formatter('en-GB', { timeZone: VENUE_TIMEZONE, hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(instant)
    )
  );
}
