import { expect, test } from 'vitest';
import type { AvailabilityDto } from '@repo/shared';
import { freeSpotIds } from '../src/components/wizard/free-spots';

const slots = (free: number[]) =>
  [16, 17, 18, 19, 20].map(hour => ({
    hour,
    available: free.includes(hour),
    booked: !free.includes(hour),
    closed: false
  }));

const tables: AvailabilityDto['tables'] = [
  { tableId: 1, label: '1', kind: 'billiard', slots: slots([16, 17, 18, 19, 20]) },
  // Free at 17 but taken at 18: fine for one hour, not for two
  { tableId: 2, label: '2', kind: 'billiard', slots: slots([16, 17, 19, 20]) },
  { tableId: 6, label: '1', kind: 'darts', slots: slots([]) }
];

test('a spot is free only when every hour of the window is', () => {
  expect([...freeSpotIds(tables, 17, 1)]).toEqual([1, 2]);
  expect([...freeSpotIds(tables, 17, 2)]).toEqual([1]);
});

test('a window running past the published hours fits nowhere', () => {
  expect(freeSpotIds(tables, 20, 2).size).toBe(0);
});
