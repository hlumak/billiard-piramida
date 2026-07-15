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
export function warsawToday(): IsoDate {
  // en-CA short style is defined as YYYY-MM-DD
  return formatter('en-CA', { timeZone: VENUE_TIMEZONE, dateStyle: 'short' }).format(
    new Date()
  ) as IsoDate;
}

export function addDays(isoDate: IsoDate, days: number): IsoDate {
  const [y, m, d] = dateParts(isoDate);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  // toISOString is defined as YYYY-MM-DDTHH:mm:ss…
  return date.toISOString().slice(0, 10) as IsoDate;
}

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

/** Warsaw wall-clock hour (0–23) of an instant. */
export function warsawHour(instant: string | Date): number {
  return Number(
    formatter('en-GB', { timeZone: VENUE_TIMEZONE, hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(instant)
    )
  );
}
