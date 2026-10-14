import { beforeEach, expect, test } from 'vitest';
import {
  goToStep,
  resetIfDateStale,
  resetWizard,
  selectDate,
  selectDuration,
  selectGame,
  selectStart,
  selectTable,
  selectTime,
  setItemQuantity,
  setSportCardCount,
  wizardStore
} from '../src/store/booking-wizard';

beforeEach(resetWizard);

const state = () => wizardStore.state;

/** Date, time and a 9ft table picked on the steps that ask for them. */
function pickUpToTable() {
  selectDate('2026-10-12');
  selectStart(18);
  selectDuration(2);
  goToStep('table');
  selectTable(1, 'billiard', '1');
}

test('date, start and length are picked on one step; the table is its own', () => {
  selectDate('2026-10-12');
  selectStart(18);
  selectDuration(2);
  // Picking does not move the guest on: "next" does
  expect(state()).toMatchObject({
    step: 'when',
    date: '2026-10-12',
    startHour: 18,
    durationHours: 2
  });

  goToStep('table');
  selectTable(1, 'billiard', '1');
  expect(state()).toMatchObject({ step: 'table', direction: 1, tableId: 1, kind: 'billiard' });
  // The spot decides what is playable: a game is set the moment it is picked
  expect(state().game).not.toBeNull();
});

test('a dartboard has no game to rack', () => {
  selectDate('2026-10-12');
  selectTime(18, 1);
  selectTable(6, 'darts', '1');
  expect(state().game).toBeNull();
});

test('re-picking the same table keeps the chosen game; another table resets it', () => {
  pickUpToTable();
  selectGame('pool');
  selectTable(1, 'billiard', '1');
  expect(state().game).toBe('pool');
  selectTable(8, 'billiard', '6');
  expect(state().game).toBe('piramida');
});

test('re-picking the same date keeps later picks; a new date clears them', () => {
  pickUpToTable();
  selectDate('2026-10-12');
  expect(state()).toMatchObject({ startHour: 18, tableId: 1 });

  selectDate('2026-10-13');
  expect(state()).toMatchObject({
    startHour: null,
    durationHours: 1,
    tableId: null,
    game: null
  });
});

test('a new start or length clears the table, since it may not be free then', () => {
  pickUpToTable();
  selectStart(20);
  expect(state()).toMatchObject({ startHour: 20, tableId: null, kind: null });

  selectTable(1, 'billiard', '1');
  selectDuration(1);
  expect(state()).toMatchObject({ durationHours: 1, tableId: null });
});

test('a window handed over from the home page lands on the table step', () => {
  selectDate('2026-10-12');
  selectTime(19, 1);
  expect(state()).toMatchObject({ step: 'table', startHour: 19, durationHours: 1 });
});

test('going back is direction -1, so the slide-in plays the other way', () => {
  pickUpToTable();
  goToStep('when');
  expect(state()).toMatchObject({ step: 'when', direction: -1 });
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
  expect(state()).toMatchObject({ step: 'when', date: null, tableId: null });
});
