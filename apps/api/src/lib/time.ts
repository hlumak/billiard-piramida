import { TZDate } from '@date-fns/tz';
import { dateParts, VENUE_TIMEZONE, type IsoDate } from '@repo/shared';

/** UTC instant of `hour:00` local Warsaw time on `isoDate`. */
export function warsawInstant(isoDate: IsoDate, hour: number): Date {
  const [y, m, d] = dateParts(isoDate);
  return new Date(new TZDate(y, m - 1, d, hour, 0, 0, VENUE_TIMEZONE).getTime());
}

/** Warsaw-local calendar date (YYYY-MM-DD) of a UTC instant. */
export function warsawDateOf(instant: Date): IsoDate {
  const tz = new TZDate(instant.getTime(), VENUE_TIMEZONE);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Constructed digit-by-digit — provably YYYY-MM-DD
  return `${tz.getFullYear()}-${pad(tz.getMonth() + 1)}-${pad(tz.getDate())}` as IsoDate;
}

export const HOUR_MS = 3_600_000;
