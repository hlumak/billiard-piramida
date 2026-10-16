import { describe, expect, test } from 'vitest';
import {
  bookingMinutes,
  formatClock,
  formatClockRange,
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
    expect(formatClock(24 * 60)).toBe('24:00');
    expect(formatClockRange(18 * 60 + 30, 90)).toBe('18:30–20:00');
  });
});
