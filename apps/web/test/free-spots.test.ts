import { expect, test } from 'vitest';
import type { AvailabilityDto } from '@repo/shared';
import { freeSpotIds } from '../src/components/wizard/free-spots';

/** Half-hour slots 16:00 … 20:30 (a 16–21 day); `free` lists the free ones as hours, 17.5 = 17:30. */
const slots = (free: number[]) =>
  [16, 16.5, 17, 17.5, 18, 18.5, 19, 19.5, 20, 20.5].map(hour => ({
    startMinute: hour * 60,
    available: free.includes(hour),
    booked: !free.includes(hour),
    closed: false
  }));

const allDay = [16, 16.5, 17, 17.5, 18, 18.5, 19, 19.5, 20, 20.5];
const tables: AvailabilityDto['tables'] = [
  { tableId: 1, label: '1', kind: 'billiard', slots: slots(allDay) },
  // Free 17:00–18:30, taken from 18:30: fine for an hour or 1:30, not for two
  {
    tableId: 2,
    label: '2',
    kind: 'billiard',
    slots: slots([16, 16.5, 17, 17.5, 18, 19.5, 20, 20.5])
  },
  { tableId: 6, label: '1', kind: 'darts', slots: slots([]) }
];

test('a spot is free only when every half hour of the window is', () => {
  expect([...freeSpotIds(tables, 17 * 60, 60)]).toEqual([1, 2]);
  expect([...freeSpotIds(tables, 17 * 60, 90)]).toEqual([1, 2]);
  expect([...freeSpotIds(tables, 17 * 60, 120)]).toEqual([1]);
  // From the half hour as well
  expect([...freeSpotIds(tables, 17 * 60 + 30, 60)]).toEqual([1, 2]);
  expect([...freeSpotIds(tables, 17 * 60 + 30, 90)]).toEqual([1]);
});

test('a window running past the published hours fits nowhere', () => {
  expect(freeSpotIds(tables, 20 * 60, 90).size).toBe(0);
  expect([...freeSpotIds(tables, 20 * 60, 60)]).toEqual([1, 2]);
});
