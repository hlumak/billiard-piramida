import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_WEEKLY_HOURS,
  hoursForDate,
  isClosedAllDay,
  isOnSlotGrid,
  isValidBookingWindow,
  maxDurationAt,
  slotStartsForDate,
  weekdayOf,
  type WeeklyHours
} from '../src/schedule.ts';

/** The published week; the functions take it as an argument now. */
const HOURS = DEFAULT_WEEKLY_HOURS;
/** Minutes after midnight of a wall-clock time — 18:30 is at(18, 30). */
const at = (hour: number, minute = 0) => hour * 60 + minute;

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

test('slot starts are half-hourly and leave room for the 1-hour minimum', () => {
  // Mon 16-21: 16:00, 16:30 … 20:00
  assert.deepEqual(slotStartsForDate('2026-07-13', HOURS), [
    at(16), at(16, 30), at(17), at(17, 30), at(18), at(18, 30), at(19), at(19, 30), at(20)
  ]);
  const saturday = slotStartsForDate('2026-07-18', HOURS); // Sat 15-23
  assert.equal(saturday[0], at(15));
  assert.equal(saturday.at(-1), at(22));
  assert.equal(saturday.length, 15);
});

test('only :00 and :30 and whole half hours are on the grid', () => {
  assert.equal(isOnSlotGrid(at(18)), true);
  assert.equal(isOnSlotGrid(at(18, 30)), true);
  assert.equal(isOnSlotGrid(at(18, 15)), false);
  assert.equal(isOnSlotGrid(90), true);
  assert.equal(isOnSlotGrid(45), false);
  assert.equal(isOnSlotGrid(30.5), false);
});

test('maxDurationAt caps at closing time', () => {
  assert.equal(maxDurationAt('2026-07-13', at(16), HOURS), 5 * 60);
  assert.equal(maxDurationAt('2026-07-13', at(19, 30), HOURS), 90);
  assert.equal(maxDurationAt('2026-07-13', at(20), HOURS), 60);
  assert.equal(maxDurationAt('2026-07-13', at(20, 30), HOURS), 0); // under an hour left
  assert.equal(maxDurationAt('2026-07-13', at(21), HOURS), 0); // closing hour, cannot start
  assert.equal(maxDurationAt('2026-07-13', at(15), HOURS), 0); // before opening
  assert.equal(maxDurationAt('2026-07-13', at(18, 15), HOURS), 0); // off the grid
});

test('isValidBookingWindow enforces the rules', () => {
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 60, HOURS), true);
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 90, HOURS), true); // 1:30
  assert.equal(isValidBookingWindow('2026-07-13', at(18, 30), 150, HOURS), true); // 2:30
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 5 * 60, HOURS), true);
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 5 * 60 + 30, HOURS), false); // past close
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 30, HOURS), false); // below minimum
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 0, HOURS), false);
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 75, HOURS), false); // 1:15
  assert.equal(isValidBookingWindow('2026-07-13', at(18, 15), 60, HOURS), false); // 18:15 start
  assert.equal(isValidBookingWindow('2026-07-17', at(22), 60, HOURS), true); // Fri last slot
});

test('a custom week drives the window rules, not the published one', () => {
  // Monday moved to 12:00-14:00; everything else left as published
  const custom: WeeklyHours = [...DEFAULT_WEEKLY_HOURS] as WeeklyHours;
  custom[1] = { open: 12, close: 14 };

  assert.deepEqual(hoursForDate('2026-07-13', custom), { open: 12, close: 14 }); // Mon
  assert.deepEqual(slotStartsForDate('2026-07-13', custom), [at(12), at(12, 30), at(13)]);
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 60, custom), false); // was valid before
  assert.equal(isValidBookingWindow('2026-07-13', at(12), 120, custom), true);
  // Untouched days still follow the published hours
  assert.deepEqual(hoursForDate('2026-07-17', custom), { open: 16, close: 23 }); // Fri
});

test('a day whose open is not before its close is shut', () => {
  const closedMondays: WeeklyHours = [...DEFAULT_WEEKLY_HOURS] as WeeklyHours;
  closedMondays[1] = { open: 0, close: 0 };

  assert.equal(isClosedAllDay(hoursForDate('2026-07-13', closedMondays)), true);
  assert.deepEqual(slotStartsForDate('2026-07-13', closedMondays), []);
  assert.equal(maxDurationAt('2026-07-13', at(16), closedMondays), 0);
  assert.equal(isValidBookingWindow('2026-07-13', at(16), 60, closedMondays), false);
  assert.equal(isClosedAllDay(hoursForDate('2026-07-17', closedMondays)), false);
});
