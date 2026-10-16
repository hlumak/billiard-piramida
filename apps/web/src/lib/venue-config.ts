import { useQuery } from '@tanstack/react-query';
import {
  BOOKING_DAYS_AHEAD,
  DEFAULT_HOURLY_RATE_GROSZ,
  DEFAULT_WEEKLY_HOURS,
  MIN_BOOKING_MINUTES,
  addDays,
  isHourClosed,
  slotStartsForDate,
  isClosedAllDay,
  type ClosureDto,
  type DayHours,
  type IsoDate,
  type VenueConfigDto,
  type WeeklyHours
} from '@repo/shared';
import { venueConfigQuery } from './queries';

/**
 * The published rates and opening hours, warmed by the root loader so this is a
 * cache read on every screen.
 *
 * The fallback is the config the club opened with, and it exists only so a
 * failed fetch renders a plausible page instead of a blank one. Nothing here
 * decides anything: every booking window and every price is re-checked by the
 * API against the database, so a stale or fallen-back value can mislead a
 * visitor for a moment but can never write a wrong booking.
 */
export const FALLBACK_VENUE_CONFIG: VenueConfigDto = {
  rates: DEFAULT_HOURLY_RATE_GROSZ,
  hours: DEFAULT_WEEKLY_HOURS,
  closures: []
};

export function useVenueConfig(): VenueConfigDto {
  const { data } = useQuery(venueConfigQuery());
  return data ?? FALLBACK_VENUE_CONFIG;
}

/**
 * The first day in the booking window with a start still to come: today
 * only while it has a half-hour start ahead, then the next day the club
 * opens — skipping times (and days) staff have closed.
 */
export function firstOpenDay(
  today: IsoDate,
  minuteNow: number,
  hours: WeeklyHours,
  closures: readonly ClosureDto[]
): IsoDate | null {
  for (let i = 0; i < BOOKING_DAYS_AHEAD; i++) {
    const day = addDays(today, i);
    for (const start of slotStartsForDate(day, hours)) {
      // Today keeps only the starts still ahead
      if (i === 0 && start <= minuteNow) continue;
      // Closures are whole hours: the shortest stay from here must miss them all
      const firstHour = Math.floor(start / 60);
      const lastHour = Math.floor((start + MIN_BOOKING_MINUTES - 1) / 60);
      let closed = false;
      for (let hour = firstHour; hour <= lastHour; hour++) {
        if (isHourClosed(day, hour, closures)) closed = true;
      }
      if (!closed) return day;
    }
  }
  return null;
}

/** Monday first, Sunday last — how a European opening-hours table reads. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export interface HoursGroup {
  /** JS weekday indexes, consecutive in display order */
  weekdays: number[];
  hours: DayHours;
  closed: boolean;
}

/**
 * Runs of adjacent weekdays that share the same hours, so the contacts card and
 * the structured data both read "Mon–Thu 16:00–21:00" instead of listing seven
 * near-identical lines. Built from the live config, so an owner who moves one
 * day's closing time simply splits the run.
 */
export function groupWeeklyHours(hours: WeeklyHours): HoursGroup[] {
  const groups: HoursGroup[] = [];
  for (const weekday of WEEKDAY_DISPLAY_ORDER) {
    const day = hours[weekday];
    if (!day) continue;
    const previous = groups.at(-1);
    if (previous && previous.hours.open === day.open && previous.hours.close === day.close) {
      previous.weekdays.push(weekday);
    } else {
      groups.push({ weekdays: [weekday], hours: day, closed: isClosedAllDay(day) });
    }
  }
  return groups;
}
