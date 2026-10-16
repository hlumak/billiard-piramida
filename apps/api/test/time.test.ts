import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_WEEKLY_HOURS, type WeeklyHours } from '@repo/shared';
import { clubDayOf, clubDayRange, warsawInstant, warsawInstantAt } from '../src/lib/time.ts';

/** Monday 13 July 2026 open 16:00–01:00, the rest of the week as published. */
const late: WeeklyHours = [...DEFAULT_WEEKLY_HOURS] as WeeklyHours;
late[1] = { open: 16, close: 25 };

test('a time past 24:00 is the next morning', () => {
  assert.deepEqual(warsawInstantAt('2026-07-13', 24 * 60 + 30), warsawInstant('2026-07-14', 0, 30));
  assert.deepEqual(
    warsawInstantAt('2026-07-13', 18 * 60 + 30),
    warsawInstant('2026-07-13', 18, 30)
  );
});

test('the small hours of a late night belong to its evening', () => {
  assert.deepEqual(clubDayOf(warsawInstant('2026-07-14', 0, 30), late), {
    date: '2026-07-13',
    minute: 24 * 60 + 30
  });
  assert.deepEqual(clubDayOf(warsawInstant('2026-07-14', 1, 0), late), {
    date: '2026-07-14',
    minute: 60
  });
  // Without a late night, midnight starts the next day as before
  assert.deepEqual(clubDayOf(warsawInstant('2026-07-14', 0, 30), DEFAULT_WEEKLY_HOURS), {
    date: '2026-07-14',
    minute: 30
  });
});

test('club days tile the calendar: Monday ends at 01:00 where Tuesday begins', () => {
  const [mondayStart, mondayEnd] = clubDayRange('2026-07-13', late);
  const [tuesdayStart, tuesdayEnd] = clubDayRange('2026-07-14', late);
  assert.deepEqual(mondayStart, warsawInstant('2026-07-13', 0));
  assert.deepEqual(mondayEnd, warsawInstant('2026-07-14', 1));
  assert.deepEqual(tuesdayStart, mondayEnd);
  assert.deepEqual(tuesdayEnd, warsawInstant('2026-07-15', 0));
});
