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

  test('a fragment is only the secret of the booking whose page it is on', () => {
    rememberBooking('abc', 'made-here');
    rememberBooking('def', 'also-made-here');

    // A link to the list with a key in it must not touch any stored booking
    window.history.replaceState(null, '', '/bookings#key=junk');
    adoptTokenFromLocation('abc');
    adoptTokenFromLocation('def');
    expect(manageTokenFor('abc')).toBe('made-here');
    expect(manageTokenFor('def')).toBe('also-made-here');

    // Nor does one booking's link give its key to another, or replace the
    // secret this browser already holds for its own
    window.history.replaceState(null, '', '/uk/booking/abc#key=mangled');
    adoptTokenFromLocation('def');
    adoptTokenFromLocation('abc');
    expect(manageTokenFor('def')).toBe('also-made-here');
    expect(manageTokenFor('abc')).toBe('made-here');

    // A booking not known here yet takes it, under a language prefix too
    window.history.replaceState(null, '', '/uk/booking/new#key=from-link');
    adoptTokenFromLocation('new');
    expect(manageTokenFor('new')).toBe('from-link');
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
