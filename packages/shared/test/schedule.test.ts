import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hoursForDate,
  isValidBookingWindow,
  maxDurationAt,
  slotStartsForDate,
  weekdayOf
} from '../src/schedule.ts';

test('weekdayOf maps calendar dates correctly', () => {
  assert.equal(weekdayOf('2026-07-13'), 1); // Monday
  assert.equal(weekdayOf('2026-07-17'), 5); // Friday
  assert.equal(weekdayOf('2026-07-18'), 6); // Saturday
  assert.equal(weekdayOf('2026-07-19'), 0); // Sunday
});

test('operating hours per weekday', () => {
  assert.deepEqual(hoursForDate('2026-07-13'), { open: 16, close: 21 }); // Mon
  assert.deepEqual(hoursForDate('2026-07-16'), { open: 16, close: 21 }); // Thu
  assert.deepEqual(hoursForDate('2026-07-17'), { open: 16, close: 23 }); // Fri
  assert.deepEqual(hoursForDate('2026-07-18'), { open: 15, close: 23 }); // Sat
  assert.deepEqual(hoursForDate('2026-07-19'), { open: 15, close: 23 }); // Sun
});

test('slot starts leave room for the 1-hour minimum', () => {
  assert.deepEqual(slotStartsForDate('2026-07-13'), [16, 17, 18, 19, 20]); // Mon 16-21
  assert.deepEqual(slotStartsForDate('2026-07-18'), [15, 16, 17, 18, 19, 20, 21, 22]); // Sat 15-23
});

test('maxDurationAt caps at closing time', () => {
  assert.equal(maxDurationAt('2026-07-13', 16), 5);
  assert.equal(maxDurationAt('2026-07-13', 20), 1);
  assert.equal(maxDurationAt('2026-07-13', 21), 0); // closing hour, cannot start
  assert.equal(maxDurationAt('2026-07-13', 15), 0); // before opening
});

test('isValidBookingWindow enforces the rules', () => {
  assert.equal(isValidBookingWindow('2026-07-13', 16, 1), true);
  assert.equal(isValidBookingWindow('2026-07-13', 16, 5), true);
  assert.equal(isValidBookingWindow('2026-07-13', 16, 6), false); // past close
  assert.equal(isValidBookingWindow('2026-07-13', 16, 0), false); // below minimum
  assert.equal(isValidBookingWindow('2026-07-13', 16.5, 1), false); // non-integer
  assert.equal(isValidBookingWindow('2026-07-17', 22, 1), true); // Fri last slot
});
