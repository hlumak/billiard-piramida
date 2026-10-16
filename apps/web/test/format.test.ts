import { describe, expect, test } from 'vitest';
import { DEFAULT_WEEKLY_HOURS, type WeeklyHours } from '@repo/shared';
import {
  bookingMinutes,
  formatClock,
  formatClockRange,
  formatHour,
  warsawHour,
  warsawMinute
} from '../src/lib/format';

describe('bookingMinutes', () => {
  test('a booking ending at midnight ends at 24:00, not 0', () => {
    // 22:00–24:00 Warsaw on a CEST day (UTC+2)
    const booking = { startsAt: '2026-07-04T20:00:00.000Z', endsAt: '2026-07-04T22:00:00.000Z' };
    expect(warsawHour(booking.endsAt)).toBe(0);
    expect(warsawMinute(booking.endsAt)).toBe(0);
    expect(bookingMinutes(booking)).toEqual({ start: 22 * 60, end: 24 * 60 });
  });

  test('an ordinary evening booking', () => {
    // 18:00–20:00 Warsaw on a CET day (UTC+1)
    const booking = { startsAt: '2026-12-05T17:00:00.000Z', endsAt: '2026-12-05T19:00:00.000Z' };
    expect(bookingMinutes(booking)).toEqual({ start: 18 * 60, end: 20 * 60 });
  });

  test("in a late night's small hours, on the evening's scale", () => {
    // Monday 16:00–01:00; Tuesday 20 Oct 2026 00:30–01:00 Warsaw (UTC+2) is Monday's 24:30
    const hours = [...DEFAULT_WEEKLY_HOURS] as WeeklyHours;
    hours[1] = { open: 16, close: 25 };
    const booking = { startsAt: '2026-10-19T22:30:00.000Z', endsAt: '2026-10-19T23:00:00.000Z' };
    expect(bookingMinutes(booking)).toEqual({ start: 30, end: 60 });
    expect(bookingMinutes(booking, hours)).toEqual({ start: 24 * 60 + 30, end: 25 * 60 });
  });

  test('a booking on the half hour', () => {
    // 18:30–20:00 Warsaw on a CET day (UTC+1)
    const booking = { startsAt: '2026-12-05T17:30:00.000Z', endsAt: '2026-12-05T19:00:00.000Z' };
    expect(bookingMinutes(booking)).toEqual({ start: 18 * 60 + 30, end: 20 * 60 });
  });
});

describe('formatClock', () => {
  test('minutes after midnight as HH:MM', () => {
    expect(formatClock(18 * 60)).toBe('18:00');
    expect(formatClock(18 * 60 + 30)).toBe('18:30');
    expect(formatClock(9 * 60 + 30)).toBe('09:30');
    expect(formatClockRange(18 * 60 + 30, 90)).toBe('18:30–20:00');
    // A stay ending at midnight ends "24:00"
    expect(formatClockRange(22 * 60, 120)).toBe('22:00–24:00');
  });

  test('past midnight on a late night reads as the morning clock', () => {
    expect(formatClock(24 * 60)).toBe('00:00');
    expect(formatClock(24 * 60 + 30)).toBe('00:30');
    expect(formatClockRange(23 * 60 + 30, 90)).toBe('23:30–01:00');
    expect(formatClockRange(24 * 60, 60)).toBe('00:00–01:00');
    expect(formatHour(24)).toBe('24:00');
    expect(formatHour(25)).toBe('01:00');
    expect(formatHour(26)).toBe('02:00');
  });
});
