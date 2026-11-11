import {
  clubClosureOn,
  hoursForDate,
  isClosedAllDay,
  type ClosedSpan,
  type ClosureDto,
  type DayClosure,
  type DayHours,
  type IsoDate,
  type WeeklyHours
} from '@repo/shared';
import { m } from '../paraglide/messages.js';
import { formatClock, formatHour } from './format';

/** One closed stretch of a day in words: "Closed from 18:00", "Closed all day"… */
export function closedSpanText(span: Pick<ClosedSpan, 'from' | 'to'>, day: DayHours): string {
  if (span.from <= day.open && span.to >= day.close) return m.closed_all_day();
  // A start at 24 on a late night is midnight, "00:00", not the closing "24:00"
  const from = formatClock(span.from * 60);
  if (span.to >= day.close) return m.closed_from({ time: from });
  if (span.from <= day.open) return m.closed_until({ time: formatHour(span.to) });
  return m.closed_between({ from, to: formatHour(span.to) });
}

/** …and the reason staff gave, when they gave one: "Closed from 18:00 — private event". */
export function closedSpanLine(span: ClosedSpan, day: DayHours): string {
  const text = closedSpanText(span, day);
  return span.reason ? `${text} — ${span.reason}` : text;
}

/**
 * The hours a day still opens for, when one closure takes its start or its
 * end ("16:00–18:00" for a day closed from 18:00); null when that can't be
 * said as one range (closed in the middle, or several closures).
 */
export function hoursLeft(closure: DayClosure, day: DayHours): DayHours | null {
  const [span] = closure.spans;
  if (closure.allDay || span === undefined || closure.spans.length > 1) return null;
  if (span.to >= day.close) return { open: day.open, close: span.from };
  if (span.from <= day.open) return { open: span.to, close: day.close };
  return null;
}

/** The short tag a date tile carries for a part-closed day: "until 18:00", "from 20:00". */
export function partlyClosedTag(closure: DayClosure, day: DayHours): string {
  const left = hoursLeft(closure, day);
  if (left === null) return m.date_partly_closed();
  return left.open === day.open
    ? m.date_open_until({ time: formatHour(left.close) })
    : m.date_open_from({ time: formatClock(left.open * 60) });
}

/**
 * "Open today 16:00–21:00" or "Closed today", for the home page's pill and the
 * menu — with the closures staff set, not the weekly hours alone: on a day the
 * club was closed for an event the pill still promised the usual hours. A day
 * closed in part shows the hours that are left when they can be said as one
 * range; otherwise the usual ones stand, and the hours list has the detail.
 */
export function todayLine(
  date: IsoDate,
  hours: WeeklyHours,
  closures: readonly ClosureDto[]
): string {
  const day = hoursForDate(date, hours);
  const closure = clubClosureOn(date, hours, closures);
  if (isClosedAllDay(day) || closure?.allDay) return m.closed_today();
  const open = (closure && hoursLeft(closure, day)) ?? day;
  return m.open_today({ open: formatHour(open.open), close: formatHour(open.close) });
}
