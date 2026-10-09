import { describe, expect, test } from 'vitest';
import { bookingHours, warsawHour } from '../src/lib/format';

describe('bookingHours', () => {
  test('a booking ending at midnight ends at 24, not 0', () => {
    // 22:00–24:00 Warsaw on a CEST day (UTC+2)
    const booking = { startsAt: '2026-07-04T20:00:00.000Z', endsAt: '2026-07-04T22:00:00.000Z' };
    expect(warsawHour(booking.endsAt)).toBe(0);
    expect(bookingHours(booking)).toEqual({ start: 22, end: 24 });
  });

  test('an ordinary evening booking', () => {
    // 18:00–20:00 Warsaw on a CET day (UTC+1)
    const booking = { startsAt: '2026-12-05T17:00:00.000Z', endsAt: '2026-12-05T19:00:00.000Z' };
    expect(bookingHours(booking)).toEqual({ start: 18, end: 20 });
  });
});
