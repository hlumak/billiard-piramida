import { beforeEach, describe, expect, test } from 'vitest';
import {
  adoptTokenFromLocation,
  forgetBooking,
  manageTokenFor,
  recentBookings,
  rememberBooking
} from '../src/lib/recent-bookings';

const KEY = 'piramida.bookings';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('recent bookings', () => {
  test('entries stored before secrets existed (bare ids) still load', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['legacy-id', { id: 'new-id', token: 't1' }]));
    expect(recentBookings()).toEqual([{ id: 'legacy-id' }, { id: 'new-id', token: 't1' }]);
    expect(manageTokenFor('legacy-id')).toBeUndefined();
    expect(manageTokenFor('new-id')).toBe('t1');
  });

  test('remembering again moves the booking up and never drops a known secret', () => {
    rememberBooking('a', 'secret-a');
    rememberBooking('b');
    rememberBooking('a');
    expect(recentBookings()).toEqual([{ id: 'a', token: 'secret-a' }, { id: 'b' }]);
  });

  test('the booking link fragment hands its secret to this browser', () => {
    window.history.replaceState(null, '', '/booking/abc#key=from-link');
    adoptTokenFromLocation('abc');
    expect(manageTokenFor('abc')).toBe('from-link');
  });

  test('forgetting removes only that booking', () => {
    rememberBooking('a', 'x');
    rememberBooking('b', 'y');
    forgetBooking('a');
    expect(recentBookings()).toEqual([{ id: 'b', token: 'y' }]);
  });

  test('garbage in storage is an empty list, not a crash', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(recentBookings()).toEqual([]);
  });
});
