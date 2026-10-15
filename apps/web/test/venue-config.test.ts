import { expect, test } from 'vitest';
import { DEFAULT_WEEKLY_HOURS, type WeeklyHours } from '@repo/shared';
import { firstOpenDay } from '../src/lib/venue-config';

// 2026-10-15 is a Thursday: 16:00–21:00 in the default hours
const thursday = '2026-10-15';

test('today, while its last start hour is still ahead', () => {
  expect(firstOpenDay(thursday, 12, DEFAULT_WEEKLY_HOURS)).toBe(thursday);
  expect(firstOpenDay(thursday, 19, DEFAULT_WEEKLY_HOURS)).toBe(thursday);
});

test('then the next day the club opens, skipping closed days', () => {
  expect(firstOpenDay(thursday, 20, DEFAULT_WEEKLY_HOURS)).toBe('2026-10-16');
  const fridayClosed: WeeklyHours = [...DEFAULT_WEEKLY_HOURS];
  fridayClosed[5] = { open: 0, close: 0 };
  expect(firstOpenDay(thursday, 20, fridayClosed)).toBe('2026-10-17');
});

test('none when every day in the window is closed', () => {
  const closed = DEFAULT_WEEKLY_HOURS.map(() => ({ open: 0, close: 0 })) as WeeklyHours;
  expect(firstOpenDay(thursday, 12, closed)).toBeNull();
});
