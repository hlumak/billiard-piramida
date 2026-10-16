import { expect, test } from 'vitest';
import { DEFAULT_WEEKLY_HOURS, type ClosureDto, type WeeklyHours } from '@repo/shared';
import { bookingClubDate, clubMoment, firstOpenDay } from '../src/lib/venue-config';

// 2026-10-15 is a Thursday: 16:00–21:00 in the default hours
const thursday = '2026-10-15';

/** Minutes after midnight of a wall-clock time — the "now" firstOpenDay takes. */
const at = (hour: number, minute = 0) => hour * 60 + minute;

test('today, while its last start is still ahead', () => {
  expect(firstOpenDay(thursday, at(12), DEFAULT_WEEKLY_HOURS, [])).toBe(thursday);
  expect(firstOpenDay(thursday, at(19), DEFAULT_WEEKLY_HOURS, [])).toBe(thursday);
  // The last start is 20:00 (an hour before closing): at 19:40 it is still ahead
  expect(firstOpenDay(thursday, at(19, 40), DEFAULT_WEEKLY_HOURS, [])).toBe(thursday);
});

test('then the next day the club opens, skipping closed days', () => {
  expect(firstOpenDay(thursday, at(20), DEFAULT_WEEKLY_HOURS, [])).toBe('2026-10-16');
  const fridayClosed: WeeklyHours = [...DEFAULT_WEEKLY_HOURS];
  fridayClosed[5] = { open: 0, close: 0 };
  expect(firstOpenDay(thursday, at(20), fridayClosed, [])).toBe('2026-10-17');
});

test("on a late night, the small hours still offer the evening's last starts", () => {
  // Thursday 15 October until 01:00
  const late: WeeklyHours = [...DEFAULT_WEEKLY_HOURS];
  late[4] = { open: 16, close: 25 };
  // At 23:40 the 00:00 start is still ahead; at 00:10 nothing is
  expect(firstOpenDay(thursday, at(23, 40), late, [])).toBe(thursday);
  expect(firstOpenDay(thursday, at(24, 10), late, [])).toBe('2026-10-16');
});

test("the club's today runs until a late night closes", () => {
  const late: WeeklyHours = [...DEFAULT_WEEKLY_HOURS];
  late[4] = { open: 16, close: 25 };
  // Friday 16 October 00:30 Warsaw (UTC+2) is still Thursday night
  const smallHours = Date.parse('2026-10-15T22:30:00.000Z');
  expect(clubMoment(late, smallHours)).toEqual({ date: thursday, minute: at(24, 30) });
  expect(clubMoment(DEFAULT_WEEKLY_HOURS, smallHours)).toEqual({
    date: '2026-10-16',
    minute: at(0, 30)
  });
  // From 01:00 it is Friday's
  expect(clubMoment(late, Date.parse('2026-10-15T23:00:00.000Z')).date).toBe('2026-10-16');
  expect(bookingClubDate({ startsAt: '2026-10-15T22:30:00.000Z' }, late)).toBe(thursday);
});

test('none when every day in the window is closed', () => {
  const closed = DEFAULT_WEEKLY_HOURS.map(() => ({ open: 0, close: 0 })) as WeeklyHours;
  expect(firstOpenDay(thursday, at(12), closed, [])).toBeNull();
});

test('skips hours and days staff have closed', () => {
  const closure = (over: Partial<ClosureDto>): ClosureDto => ({
    id: 'c',
    startDate: thursday,
    startHour: 18,
    endDate: thursday,
    endHour: 21,
    tableIds: null,
    reason: null,
    ...over
  });
  // Closed from 18:00: at 12:00 the afternoon is still there; at 16:45 a 17:00
  // start still fits an hour before it, at 17:00 nothing does (17:30 would run into it)
  expect(firstOpenDay(thursday, at(12), DEFAULT_WEEKLY_HOURS, [closure({})])).toBe(thursday);
  expect(firstOpenDay(thursday, at(16, 45), DEFAULT_WEEKLY_HOURS, [closure({})])).toBe(thursday);
  expect(firstOpenDay(thursday, at(17), DEFAULT_WEEKLY_HOURS, [closure({})])).toBe('2026-10-16');
  // Thursday and Friday closed for whole days: Saturday
  const twoDays = closure({ startHour: 0, endDate: '2026-10-17', endHour: 0 });
  expect(firstOpenDay(thursday, at(12), DEFAULT_WEEKLY_HOURS, [twoDays])).toBe('2026-10-17');
  // A single table's closure closes nothing for the day
  expect(firstOpenDay(thursday, at(17), DEFAULT_WEEKLY_HOURS, [closure({ tableIds: [1] })])).toBe(
    thursday
  );
});
