import { TZDate } from '@date-fns/tz';
import {
  addDays,
  clubDateAt,
  dateParts,
  hoursForDate,
  nightTailMinutes,
  VENUE_TIMEZONE,
  type IsoDate,
  type WeeklyHours
} from '@repo/shared';

/** UTC instant of `hour:minute` local Warsaw time on `isoDate`. */
export function warsawInstant(isoDate: IsoDate, hour: number, minute = 0): Date {
  const [y, m, d] = dateParts(isoDate);
  return new Date(new TZDate(y, m - 1, d, hour, minute, 0, VENUE_TIMEZONE).getTime());
}

/**
 * UTC instant of a time of day given as minutes after local midnight
 * (18:30 = 1110). Past 24:00 is the next morning: a club day that runs to
 * 01:00 puts 00:30 at 1470.
 */
export function warsawInstantAt(isoDate: IsoDate, minuteOfDay: number): Date {
  const days = Math.floor(minuteOfDay / (24 * 60));
  const rest = minuteOfDay - days * 24 * 60;
  return warsawInstant(addDays(isoDate, days), Math.floor(rest / 60), rest % 60);
}

/**
 * The club day an instant belongs to and its time on that day: Tuesday 00:30
 * is Monday at 1470 while Monday's night runs past it, else its own date.
 */
export function clubDayOf(instant: Date, hours: WeeklyHours): { date: IsoDate; minute: number } {
  return clubDateAt(warsawDateOf(instant), warsawMinuteOf(instant), hours);
}

/**
 * [start, end) of one club day: from where the previous night ended (local
 * midnight, unless it ran late) to midnight or the end of this day's own
 * late night. Consecutive days tile the calendar without a gap or overlap.
 */
export function clubDayRange(isoDate: IsoDate, hours: WeeklyHours): [start: Date, end: Date] {
  const previousTail = nightTailMinutes(hoursForDate(addDays(isoDate, -1), hours));
  const ownTail = nightTailMinutes(hoursForDate(isoDate, hours));
  return [warsawInstantAt(isoDate, previousTail), warsawInstantAt(addDays(isoDate, 1), ownTail)];
}

/** Warsaw-local calendar date (YYYY-MM-DD) of a UTC instant. */
export function warsawDateOf(instant: Date): IsoDate {
  const tz = new TZDate(instant.getTime(), VENUE_TIMEZONE);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Constructed digit-by-digit — provably YYYY-MM-DD
  return `${tz.getFullYear()}-${pad(tz.getMonth() + 1)}-${pad(tz.getDate())}` as IsoDate;
}

/** Warsaw-local wall-clock hour (0-23) of a UTC instant. */
export function warsawHourOf(instant: Date): number {
  return new TZDate(instant.getTime(), VENUE_TIMEZONE).getHours();
}

/** Warsaw-local wall-clock time of a UTC instant, as minutes after midnight. */
export function warsawMinuteOf(instant: Date): number {
  const tz = new TZDate(instant.getTime(), VENUE_TIMEZONE);
  return tz.getHours() * 60 + tz.getMinutes();
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/** Whole minutes between two instants — a booking's length. */
export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MINUTE_MS);
}

/**
 * [start, end) of a venue-local calendar day as UTC instants: local midnight
 * to the next local midnight. Not start + 24 h — the two DST days are 23 and
 * 25 hours long, and a fixed 24 h dropped (or borrowed) an hour at the edge.
 */
export function warsawDayRange(isoDate: IsoDate): [start: Date, end: Date] {
  return [warsawInstant(isoDate, 0), warsawInstant(addDays(isoDate, 1), 0)];
}
