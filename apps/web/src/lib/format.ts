import {
  clubDateAt,
  dateParts,
  VENUE_TIMEZONE,
  type IsoDate,
  type WeeklyHours
} from '@repo/shared';
import { m as msg } from '../paraglide/messages.js';
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

const numberCache = new Map<string, Intl.NumberFormat>();

/** A number in the visitor's locale ("4,8", "1 250"); built once per variant like the dates. */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  const key = `${intlTag()}|${JSON.stringify(options)}`;
  let cached = numberCache.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(intlTag(), options);
    numberCache.set(key, cached);
  }
  return cached.format(value);
}

const relativeCache = new Map<string, Intl.RelativeTimeFormat>();

/** "сьогодні", "завтра", "через 31 день": a whole-day distance in words. */
export function formatDaysFromNow(days: number): string {
  const tag = intlTag();
  let cached = relativeCache.get(tag);
  if (!cached) {
    cached = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
    relativeCache.set(tag, cached);
  }
  return cached.format(days, 'day');
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

/** "чт, 17 лип." — weekday + day + month for a YYYY-MM-DD, locale-aware; with
 *  `withYear`, "чт, 17 лип. 2025 р." for a list that spans years. */
export function formatDay(isoDate: IsoDate, { withYear = false } = {}): string {
  return formatter(intlTag(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
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

/** "15 листопада": day and month only, in the case a "until …" phrase takes. */
export function formatDayMonth(isoDate: IsoDate): string {
  return formatter(intlTag(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    utcDate(isoDate)
  );
}

/** The three lines of a calendar tile: "чт", "15", "жовт." */
export function dateTileParts(isoDate: IsoDate): { weekday: string; day: number; month: string } {
  const date = utcDate(isoDate);
  return {
    weekday: formatter(intlTag(), { weekday: 'short', timeZone: 'UTC' }).format(date),
    day: dateParts(isoDate)[2],
    month: formatter(intlTag(), { month: 'short', timeZone: 'UTC' }).format(date)
  };
}

/** "Жовтень 2026": the month a date falls in, as a heading over a calendar. */
export function formatMonthYear(isoDate: IsoDate): string {
  const month = formatter(intlTag(), { month: 'long', timeZone: 'UTC' }).format(utcDate(isoDate));
  return `${month.charAt(0).toLocaleUpperCase(intlTag())}${month.slice(1)} ${dateParts(isoDate)[0]}`;
}

/** Localized weekday name for a JS weekday index (0 = Sunday). */
export function weekdayName(weekday: number, style: 'long' | 'short' = 'long'): string {
  // 2026-03-01 was a Sunday, so adding the index lands on the wanted weekday
  const date = new Date(Date.UTC(2026, 2, 1 + weekday));
  return formatter(intlTag(), { weekday: style, timeZone: 'UTC' }).format(date);
}

/** An hour of the club's day as the wall clock shows it: past 24 is the next morning (25 → 1). */
export function wallHour(hour: number): number {
  return hour > 24 ? hour - 24 : hour;
}

/** "16:00" for an opening hour; a closing 24 stays "24:00", 25 is "01:00". */
export function formatHour(hour: number): string {
  return `${String(wallHour(hour)).padStart(2, '0')}:00`;
}

/**
 * "18:30" for a time of the club's day given as minutes after midnight; from
 * 1440 it is the next morning, so a late night's 1470 reads "00:30".
 */
export function formatClock(minuteOfDay: number): string {
  const wall = minuteOfDay >= 24 * 60 ? minuteOfDay - 24 * 60 : minuteOfDay;
  const hours = Math.floor(wall / 60);
  const minutes = wall % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** "18:30–20:00": a stay from a start, both as minutes after midnight; one ending at midnight ends "24:00". */
export function formatClockRange(startMinute: number, durationMinutes: number): string {
  const end = startMinute + durationMinutes;
  return `${formatClock(startMinute)}–${end === 24 * 60 ? '24:00' : formatClock(end)}`;
}

/** A booking's length in hours, in the visitor's locale: "1 год", "1,5 год", "2 h". */
export function formatDuration(minutes: number): string {
  return msg.hours_n({ n: formatNumber(minutes / 60, { maximumFractionDigits: 1 }) });
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
 * Venue-local start and end of a booking as minutes after midnight, on one
 * scale: a booking ending at midnight ends at 1440. `warsawMinute(endsAt)`
 * reads that as 0, which made a 22–24 booking look like it ended before it
 * began, so the end is start + length. With the week's `hours` the start is
 * on the booking's club day: 00:30 on a late night is 1470 of the evening.
 */
export function bookingMinutes(
  booking: { startsAt: string; endsAt: string },
  hours?: WeeklyHours
): {
  start: number;
  end: number;
} {
  const start = hours
    ? clubDateAt(warsawDate(booking.startsAt), warsawMinute(booking.startsAt), hours).minute
    : warsawMinute(booking.startsAt);
  const duration = Math.round((Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 60_000);
  return { start, end: start + duration };
}

/** Warsaw wall-clock time of an instant, as minutes after midnight (0–1439). */
export function warsawMinute(instant: string | number | Date): number {
  const [hours = 0, minutes = 0] = formatter('en-GB', {
    timeZone: VENUE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
    .format(new Date(instant))
    .split(':')
    .map(Number);
  return hours * 60 + minutes;
}

/** Warsaw wall-clock hour (0–23) of an instant. */
export function warsawHour(instant: string | number | Date): number {
  return Number(
    formatter('en-GB', { timeZone: VENUE_TIMEZONE, hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(instant)
    )
  );
}
