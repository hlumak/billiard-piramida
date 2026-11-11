import {
  addDays,
  hoursForDate,
  isClosedAllDay,
  nightTailMinutes,
  type IsoDate,
  type WeeklyHours
} from './schedule.ts';

/** What staff may tell guests about a closure ("Приватний захід"), in characters. */
export const MAX_CLOSURE_REASON_LENGTH = 80;
/** Longest closure staff can enter in one go — a holiday, not "closed forever". */
export const MAX_CLOSURE_DAYS = 62;

/**
 * A stretch of time the club, or some of its spots, takes no bookings: a
 * private event, a holiday, a table having its cloth changed. Staff enter it
 * in the venue's wall-clock time, and that is how it travels: the date and
 * hour it starts, and the date and hour it ends (exclusive). A whole day is
 * 00:00 to 00:00 of the next day.
 */
export interface ClosureDto {
  id: string;
  startDate: IsoDate;
  /** 0–23 */
  startHour: number;
  endDate: IsoDate;
  /** 0–23, exclusive: 0 is midnight at the start of `endDate` */
  endHour: number;
  /** The spots it closes; null is the whole club */
  tableIds: number[] | null;
  /** Shown to guests when the whole club is closed; null when staff gave none */
  reason: string | null;
}

/**
 * A booking that stands in the way of a closure: staff move or cancel it
 * (and tell the guest) before the time can be closed.
 */
export interface ClosureConflictDto {
  bookingId: string;
  tableId: number;
  /** Both null for an offline client */
  customerName: string | null;
  customerPhone: string | null;
  /** ISO instants */
  startsAt: string;
  endsAt: string;
}

/**
 * Closed hours of one club day, `to` exclusive: 24 is midnight, and past it
 * is the morning after (25 = 01:00), where a night that runs late reaches.
 */
export interface ClosedSpan {
  from: number;
  to: number;
  reason: string | null;
}

/** The part of `closure` that falls on `date`, as hours, or null when none does. */
export function closureSpanOn(closure: ClosureDto, date: IsoDate): ClosedSpan | null {
  if (closure.startDate > date || closure.endDate < date) return null;
  const from = closure.startDate === date ? closure.startHour : 0;
  const to = closure.endDate === date ? closure.endHour : 24;
  return from < to ? { from, to, reason: closure.reason } : null;
}

/** Does the closure apply to this spot? Without a spot: only whole-club closures do. */
function covers(closure: ClosureDto, tableId: number | undefined): boolean {
  if (closure.tableIds === null) return true;
  return tableId !== undefined && closure.tableIds.includes(tableId);
}

/**
 * The closed hours on `date` and the morning after it (as 24 and up, where a
 * late night reaches), earliest first: for one spot (its own closures and
 * the club's), or, without one, the club's alone. A closure running through
 * midnight comes back as two spans that meet at 24.
 */
export function closedSpansOn(
  date: IsoDate,
  closures: readonly ClosureDto[],
  tableId?: number
): ClosedSpan[] {
  const spans: ClosedSpan[] = [];
  const morningAfter = addDays(date, 1);
  for (const closure of closures) {
    if (!covers(closure, tableId)) continue;
    const span = closureSpanOn(closure, date);
    if (span) spans.push(span);
    const after = closureSpanOn(closure, morningAfter);
    if (after) spans.push({ from: after.from + 24, to: after.to + 24, reason: after.reason });
  }
  return spans.sort((a, b) => a.from - b.from);
}

export function isHourClosed(
  date: IsoDate,
  hour: number,
  closures: readonly ClosureDto[],
  tableId?: number
): boolean {
  return closedSpansOn(date, closures, tableId).some(span => span.from <= hour && hour < span.to);
}

/** How the club's closures change one day's opening hours. */
export interface DayClosure {
  /** Clipped to the day's opening hours; only the ones that take some away */
  spans: ClosedSpan[];
  /** Nothing of the day's opening hours is left */
  allDay: boolean;
}

/**
 * The club's closures as they bear on one opening day, or null when they take
 * none of its hours (or the day is shut anyway by the weekly hours).
 */
export function clubClosureOn(
  date: IsoDate,
  hours: WeeklyHours,
  closures: readonly ClosureDto[]
): DayClosure | null {
  const day = hoursForDate(date, hours);
  if (isClosedAllDay(day)) return null;
  const spans = closedSpansOn(date, closures)
    .map(span => ({
      from: Math.max(span.from, day.open),
      to: Math.min(span.to, day.close),
      reason: span.reason
    }))
    .filter(span => span.from < span.to);
  if (spans.length === 0) return null;
  let openHours = 0;
  for (let hour = day.open; hour < day.close; hour++) {
    if (!spans.some(span => span.from <= hour && hour < span.to)) openHours++;
  }
  return { spans, allDay: openHours === 0 };
}

/**
 * The stretch that closes the club days `first` to `last` whole: from where
 * the night before `first` ends to where `last`'s own night would have ended.
 * Midnight to midnight when neither runs late. On a week with late nights a
 * closure from midnight to midnight is the wrong one twice over: it leaves
 * the last day's small hours (00:00–02:00) open to book, and takes the night
 * before's instead.
 */
export function wholeDaysRange(
  first: IsoDate,
  last: IsoDate,
  hours: WeeklyHours
): Pick<ClosureDto, 'startDate' | 'startHour' | 'endDate' | 'endHour'> {
  return {
    startDate: first,
    startHour: nightTailMinutes(hoursForDate(addDays(first, -1), hours)) / 60,
    endDate: addDays(last, 1),
    endHour: nightTailMinutes(hoursForDate(last, hours)) / 60
  };
}

/**
 * The days a closure covers when it is one of whole days — shown as days
 * rather than hours — or null when it is not: midnight to midnight, or, given
 * the week's `hours`, the club days' own bounds (see wholeDaysRange).
 */
export function wholeDaysOf(
  closure: ClosureDto,
  hours?: WeeklyHours
): { first: IsoDate; last: IsoDate } | null {
  if (closure.endDate <= closure.startDate) return null;
  const days = { first: closure.startDate, last: addDays(closure.endDate, -1) };
  if (closure.startHour === 0 && closure.endHour === 0) return days;
  if (hours === undefined) return null;
  const range = wholeDaysRange(days.first, days.last, hours);
  return closure.startHour === range.startHour && closure.endHour === range.endHour ? days : null;
}

/** A closure of whole days: shown as days rather than hours. */
export function isWholeDays(closure: ClosureDto, hours?: WeeklyHours): boolean {
  return wholeDaysOf(closure, hours) !== null;
}
