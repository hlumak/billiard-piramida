import { expect, test } from 'vitest';
import type { MenuItemDto } from '@repo/shared';
import { ApiError } from '../src/lib/api';
import {
  bookingRequestFrom,
  needsNewTime,
  orderLinesFrom,
  type BookingDraft
} from '../src/components/wizard/booking-request';

const fries: MenuItemDto = {
  id: 3,
  slug: 'fries',
  category: 'snack',
  name: 'Fries',
  description: null,
  priceGrosz: 15_00
};

const billiard: BookingDraft = {
  date: '2026-10-12',
  startHour: 18,
  durationHours: 2,
  tableId: 4,
  kind: 'billiard',
  tableLabel: '4',
  game: 'pool'
};

test('a dish that left the menu drops out of the order instead of failing it', () => {
  expect(orderLinesFrom({ 3: 2, 99: 1 }, [fries])).toEqual([{ item: fries, quantity: 2 }]);
  // Menu not loaded yet: nothing can be priced
  expect(orderLinesFrom({ 3: 2 }, undefined)).toEqual([]);
});

test('the request carries the picks, trimmed contact details and the priced lines', () => {
  const request = bookingRequestFrom(
    billiard,
    { customerName: '  Ola ', customerPhone: ' +48601234567 ' },
    1,
    [{ item: fries, quantity: 2 }]
  );
  expect(request).toEqual({
    date: '2026-10-12',
    startHour: 18,
    durationHours: 2,
    tableId: 4,
    game: 'pool',
    customerName: 'Ola',
    customerPhone: '+48601234567',
    sportCardCount: 1,
    items: [{ foodItemId: 3, quantity: 2 }]
  });
});

test('a dartboard booking sends no game key at all', () => {
  const request = bookingRequestFrom(
    { ...billiard, tableId: 6, kind: 'darts', tableLabel: '1', game: null },
    { customerName: 'Ola', customerPhone: '+48601234567' },
    0,
    []
  );
  expect('game' in request).toBe(false);
});

test('only slot/time refusals send the guest back to the time step', () => {
  for (const code of ['slot_taken', 'start_in_past', 'outside_operating_hours']) {
    expect(needsNewTime(new ApiError(409, code))).toBe(true);
  }
  expect(needsNewTime(new ApiError(409, 'too_many_bookings'))).toBe(false);
  expect(needsNewTime(new Error('network'))).toBe(false);
  expect(needsNewTime(null)).toBe(false);
});
