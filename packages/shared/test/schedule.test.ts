import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_WEEKLY_HOURS,
  hoursForDate,
  isClosedAllDay,
  isValidBookingWindow,
  maxDurationAt,
  slotStartsForDate,
  weekdayOf,
  type WeeklyHours
} from '../src/schedule.ts';

/** The published week; the functions take it as an argument now. */
const HOURS = DEFAULT_WEEKLY_HOURS;

test('weekdayOf maps calendar dates correctly', () => {
  assert.equal(weekdayOf('2026-07-13'), 1); // Monday
  assert.equal(weekdayOf('2026-07-17'), 5); // Friday
  assert.equal(weekdayOf('2026-07-18'), 6); // Saturday
  assert.equal(weekdayOf('2026-07-19'), 0); // Sunday
});

test('operating hours per weekday', () => {
  assert.deepEqual(hoursForDate('2026-07-13', HOURS), { open: 16, close: 21 }); // Mon
  assert.deepEqual(hoursForDate('2026-07-16', HOURS), { open: 16, close: 21 }); // Thu
  assert.deepEqual(hoursForDate('2026-07-17', HOURS), { open: 16, close: 23 }); // Fri
  assert.deepEqual(hoursForDate('2026-07-18', HOURS), { open: 15, close: 23 }); // Sat
  assert.deepEqual(hoursForDate('2026-07-19', HOURS), { open: 15, close: 23 }); // Sun
});

test('slot starts leave room for the 1-hour minimum', () => {
  assert.deepEqual(slotStartsForDate('2026-07-13', HOURS), [16, 17, 18, 19, 20]); // Mon 16-21
  assert.deepEqual(slotStartsForDate('2026-07-18', HOURS), [15, 16, 17, 18, 19, 20, 21, 22]); // Sat 15-23
});

test('maxDurationAt caps at closing time', () => {
  assert.equal(maxDurationAt('2026-07-13', 16, HOURS), 5);
  assert.equal(maxDurationAt('2026-07-13', 20, HOURS), 1);
  assert.equal(maxDurationAt('2026-07-13', 21, HOURS), 0); // closing hour, cannot start
  assert.equal(maxDurationAt('2026-07-13', 15, HOURS), 0); // before opening
});

test('isValidBookingWindow enforces the rules', () => {
  assert.equal(isValidBookingWindow('2026-07-13', 16, 1, HOURS), true);
  assert.equal(isValidBookingWindow('2026-07-13', 16, 5, HOURS), true);
  assert.equal(isValidBookingWindow('2026-07-13', 16, 6, HOURS), false); // past close
  assert.equal(isValidBookingWindow('2026-07-13', 16, 0, HOURS), false); // below minimum
  assert.equal(isValidBookingWindow('2026-07-13', 16.5, 1, HOURS), false); // non-integer
  assert.equal(isValidBookingWindow('2026-07-17', 22, 1, HOURS), true); // Fri last slot
});

test('a custom week drives the window rules, not the published one', () => {
  // Monday moved to 12:00-14:00; everything else left as published
  const custom: WeeklyHours = [...DEFAULT_WEEKLY_HOURS] as WeeklyHours;
  custom[1] = { open: 12, close: 14 };

  assert.deepEqual(hoursForDate('2026-07-13', custom), { open: 12, close: 14 }); // Mon
  assert.deepEqual(slotStartsForDate('2026-07-13', custom), [12, 13]);
  assert.equal(isValidBookingWindow('2026-07-13', 16, 1, custom), false); // was valid before
  assert.equal(isValidBookingWindow('2026-07-13', 12, 2, custom), true);
  // Untouched days still follow the published hours
  assert.deepEqual(hoursForDate('2026-07-17', custom), { open: 16, close: 23 }); // Fri
});

test('a day whose open is not before its close is shut', () => {
  const closedMondays: WeeklyHours = [...DEFAULT_WEEKLY_HOURS] as WeeklyHours;
  closedMondays[1] = { open: 0, close: 0 };

  assert.equal(isClosedAllDay(hoursForDate('2026-07-13', closedMondays)), true);
  assert.deepEqual(slotStartsForDate('2026-07-13', closedMondays), []);
  assert.equal(maxDurationAt('2026-07-13', 16, closedMondays), 0);
  assert.equal(isValidBookingWindow('2026-07-13', 16, 1, closedMondays), false);
  assert.equal(isClosedAllDay(hoursForDate('2026-07-17', closedMondays)), false);
});
