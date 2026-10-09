import { beforeEach, expect, test } from 'vitest';
import {
  goToStep,
  resetIfDateStale,
  resetWizard,
  selectDate,
  selectTable,
  selectTime,
  setItemQuantity,
  setSportCardCount,
  wizardStore
} from '../src/store/booking-wizard';

beforeEach(resetWizard);

const state = () => wizardStore.state;

/** Date, time and a 9ft table picked — the state a guest reaches the food step in. */
function pickUpToTable() {
  selectDate('2026-10-12');
  selectTime(18, 2);
  selectTable(1, 'billiard', '1');
}

test('the happy path walks the steps forward with the picks in place', () => {
  pickUpToTable();
  expect(state()).toMatchObject({
    step: 'food',
    direction: 1,
    date: '2026-10-12',
    startHour: 18,
    durationHours: 2,
    tableId: 1,
    kind: 'billiard'
  });
  // The spot decides what is playable: a game is set the moment it is picked
  expect(state().game).not.toBeNull();
});

test('a dartboard has no game to rack', () => {
  selectDate('2026-10-12');
  selectTime(18, 1);
  selectTable(6, 'darts', '1');
  expect(state().game).toBeNull();
});

test('re-confirming the same date keeps later picks; a new date clears them', () => {
  pickUpToTable();
  selectDate('2026-10-12');
  expect(state()).toMatchObject({ step: 'time', startHour: 18, tableId: 1 });

  selectDate('2026-10-13');
  expect(state()).toMatchObject({
    step: 'time',
    startHour: null,
    durationHours: 1,
    tableId: null,
    game: null
  });
});

test('a new time clears the table, since it may not be free then', () => {
  pickUpToTable();
  selectTime(20, 1);
  expect(state()).toMatchObject({ step: 'table', startHour: 20, tableId: null, kind: null });
});

test('going back is direction -1, so the slide-in plays the other way', () => {
  pickUpToTable();
  goToStep('time');
  expect(state()).toMatchObject({ step: 'time', direction: -1 });
  goToStep('table');
  expect(state().direction).toBe(1);
});

test('food quantities drop out at zero; sport cards never go negative', () => {
  setItemQuantity(3, 2);
  setItemQuantity(5, 1);
  setItemQuantity(3, 0);
  expect(state().items).toEqual({ 5: 1 });
  setSportCardCount(-1);
  expect(state().sportCardCount).toBe(0);
});

test('an abandoned wizard on a past date starts over; today or later is kept', () => {
  pickUpToTable();
  resetIfDateStale('2026-10-12');
  expect(state().date).toBe('2026-10-12');
  resetIfDateStale('2026-10-13');
  expect(state()).toMatchObject({ step: 'date', date: null, tableId: null });
});
