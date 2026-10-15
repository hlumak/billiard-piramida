import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closedSpansOn,
  closureSpanOn,
  clubClosureOn,
  isHourClosed,
  isWholeDays,
  type ClosureDto
} from '../src/closures.ts';
import { DEFAULT_WEEKLY_HOURS } from '../src/schedule.ts';

const closure = (over: Partial<ClosureDto>): ClosureDto => ({
  id: 'c',
  startDate: '2026-10-24',
  startHour: 18,
  endDate: '2026-10-24',
  endHour: 23,
  tableIds: null,
  reason: 'Приватний захід',
  ...over
});

test('closureSpanOn: one evening falls on its own date only', () => {
  const evening = closure({});
  assert.deepEqual(closureSpanOn(evening, '2026-10-24'), {
    from: 18,
    to: 23,
    reason: 'Приватний захід'
  });
  assert.equal(closureSpanOn(evening, '2026-10-23'), null);
  assert.equal(closureSpanOn(evening, '2026-10-25'), null);
});

test('closureSpanOn: several days run from the start hour to the end hour', () => {
  const holiday = closure({
    startDate: '2026-12-24',
    startHour: 15,
    endDate: '2026-12-27',
    endHour: 0
  });
  assert.deepEqual(closureSpanOn(holiday, '2026-12-24'), {
    from: 15,
    to: 24,
    reason: holiday.reason
  });
  assert.deepEqual(closureSpanOn(holiday, '2026-12-25'), {
    from: 0,
    to: 24,
    reason: holiday.reason
  });
  assert.deepEqual(closureSpanOn(holiday, '2026-12-26'), {
    from: 0,
    to: 24,
    reason: holiday.reason
  });
  // Ending at midnight takes nothing from the next day
  assert.equal(closureSpanOn(holiday, '2026-12-27'), null);
});

test('closedSpansOn: a spot sees its own closures and the club-wide ones', () => {
  const club = closure({ id: 'club', startHour: 20 });
  const table3 = closure({ id: 't3', startHour: 16, endHour: 18, tableIds: [3] });
  assert.deepEqual(
    closedSpansOn('2026-10-24', [club, table3], 3).map(s => [s.from, s.to]),
    [
      [16, 18],
      [20, 23]
    ]
  );
  assert.deepEqual(
    closedSpansOn('2026-10-24', [club, table3], 4).map(s => [s.from, s.to]),
    [[20, 23]]
  );
  // Without a spot only the club's closures count
  assert.deepEqual(
    closedSpansOn('2026-10-24', [club, table3]).map(s => [s.from, s.to]),
    [[20, 23]]
  );
});

test('isHourClosed: the end hour is open again', () => {
  const evening = closure({ startHour: 18, endHour: 20 });
  assert.equal(isHourClosed('2026-10-24', 17, [evening]), false);
  assert.equal(isHourClosed('2026-10-24', 18, [evening]), true);
  assert.equal(isHourClosed('2026-10-24', 19, [evening]), true);
  assert.equal(isHourClosed('2026-10-24', 20, [evening]), false);
});

test('clubClosureOn: clips to opening hours and says when nothing is left', () => {
  // 2026-10-24 is a Saturday: 15:00–23:00
  const evening = clubClosureOn('2026-10-24', DEFAULT_WEEKLY_HOURS, [closure({})]);
  assert.deepEqual(evening, {
    spans: [{ from: 18, to: 23, reason: 'Приватний захід' }],
    allDay: false
  });

  const wholeDay = clubClosureOn('2026-10-24', DEFAULT_WEEKLY_HOURS, [
    closure({ startHour: 0, endDate: '2026-10-25', endHour: 0 })
  ]);
  assert.deepEqual(
    wholeDay?.spans.map(s => [s.from, s.to]),
    [[15, 23]]
  );
  assert.equal(wholeDay?.allDay, true);

  // A closure outside the opening hours changes nothing
  assert.equal(
    clubClosureOn('2026-10-24', DEFAULT_WEEKLY_HOURS, [closure({ startHour: 8, endHour: 12 })]),
    null
  );
  // Nor does one for a single spot
  assert.equal(
    clubClosureOn('2026-10-24', DEFAULT_WEEKLY_HOURS, [closure({ tableIds: [1] })]),
    null
  );
});

test('isWholeDays: midnight to midnight', () => {
  assert.equal(isWholeDays(closure({ startHour: 0, endDate: '2026-10-25', endHour: 0 })), true);
  assert.equal(isWholeDays(closure({})), false);
});
