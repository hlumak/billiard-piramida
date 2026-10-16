import { createStore } from '@tanstack/react-store';
import {
  defaultGameFor,
  MIN_BOOKING_MINUTES,
  type ActivityKind,
  type BilliardGame,
  type IsoDate
} from '@repo/shared';

/**
 * Four steps: when (date, start and length on one screen), the spot, the
 * bar (optional), and the guest's contacts.
 */
export const WIZARD_STEPS = ['when', 'table', 'food', 'details'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardState {
  step: WizardStep;
  /** Which way the last step change travelled: 1 forward, -1 back. Lives here
   *  rather than being recomputed per render so the slide-in class only moves
   *  when the step does — a mid-step update (picking food) must not replay it. */
  direction: 1 | -1;
  /** Index of the furthest step the guest has been on: going back to change
   *  something leaves the later steps open to jump to again from the stepper */
  reached: number;
  date: IsoDate | null;
  /** Minutes after local midnight, on the half-hour grid */
  startMinute: number | null;
  /** An hour at least, in half-hour steps */
  durationMinutes: number;
  tableId: number | null;
  /** Kind + label of the picked spot — carried so later steps render and price
   *  it without refetching availability */
  kind: ActivityKind | null;
  tableLabel: string | null;
  /** Which cue game the table gets racked for. Null on a dartboard and before
   *  a spot is picked; set to the table's default the moment one is. */
  game: BilliardGame | null;
  /** Sport cards the players will present, 15 zł off each */
  sportCardCount: number;
  /** foodItemId → quantity */
  items: Record<number, number>;
}

const initialState: WizardState = {
  step: 'when',
  direction: 1,
  reached: 0,
  date: null,
  startMinute: null,
  durationMinutes: MIN_BOOKING_MINUTES,
  tableId: null,
  kind: null,
  tableLabel: null,
  game: null,
  sportCardCount: 0,
  items: {}
};

/** A spot is only known free for the window it was picked in. */
const noSpot = { tableId: null, kind: null, tableLabel: null, game: null } as const;

// Module-level singleton: shared across requests during SSR. Safe only while
// mutations happen exclusively from client events — never write to it on the server.
export const wizardStore = createStore<WizardState>(initialState);

export function resetWizard(): void {
  wizardStore.setState(() => initialState);
}

/**
 * The store is a long-lived SPA singleton, so an abandoned wizard can resume days
 * later on a stale (now past) date. Called on wizard mount to start fresh instead.
 */
export function resetIfDateStale(today: IsoDate): void {
  const { date } = wizardStore.state;
  if (date !== null && date < today) resetWizard();
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export function goToStep(step: WizardStep): void {
  wizardStore.setState(state => ({
    ...state,
    step,
    direction: stepIndex(step) < stepIndex(state.step) ? -1 : 1,
    reached: Math.max(state.reached, stepIndex(step))
  }));
}

/**
 * The furthest step the stepper may jump to: one the guest has been on, as
 * long as the picks it needs still stand — a new date drops the start, a new
 * start or length drops the spot, and the steps after them close again.
 */
export function furthestStep(state: WizardState): number {
  if (state.date === null || state.startMinute === null) return stepIndex('when');
  if (state.tableId === null || state.kind === null)
    return Math.min(state.reached, stepIndex('table'));
  return state.reached;
}

/** Picking the same date again keeps every later pick; a new one clears them. */
export function selectDate(date: IsoDate): void {
  wizardStore.setState(state =>
    state.date === date
      ? state
      : { ...state, date, startMinute: null, durationMinutes: MIN_BOOKING_MINUTES, ...noSpot }
  );
}

/** A new start or length may not be free on the spot picked for the old one. */
export function selectStart(startMinute: number): void {
  wizardStore.setState(state =>
    state.startMinute === startMinute ? state : { ...state, startMinute, ...noSpot }
  );
}

export function selectDuration(durationMinutes: number): void {
  wizardStore.setState(state =>
    state.durationMinutes === durationMinutes ? state : { ...state, durationMinutes, ...noSpot }
  );
}

/** Date-free shortcut for a known window (the home page's free-hours strip). */
export function selectTime(startMinute: number, durationMinutes: number): void {
  wizardStore.setState(state => ({
    ...state,
    startMinute,
    durationMinutes,
    ...noSpot,
    step: 'table',
    direction: 1,
    reached: Math.max(state.reached, stepIndex('table'))
  }));
}

export function selectTable(tableId: number, kind: ActivityKind, tableLabel: string): void {
  // The spot decides what is playable on it, so the game is picked here rather
  // than left null for a later step to guess at — the guest only ever changes
  // it, never has to supply it.
  wizardStore.setState(state => ({
    ...state,
    tableId,
    kind,
    tableLabel,
    game: state.tableId === tableId ? state.game : defaultGameFor(tableId)
  }));
}

/** The picked spot went to someone else: nothing is picked any more. */
export function clearTable(): void {
  wizardStore.setState(state => (state.tableId === null ? state : { ...state, ...noSpot }));
}

export function selectGame(game: BilliardGame): void {
  wizardStore.setState(state => ({ ...state, game }));
}

export function setSportCardCount(sportCardCount: number): void {
  wizardStore.setState(state => ({ ...state, sportCardCount: Math.max(0, sportCardCount) }));
}

export function setItemQuantity(foodItemId: number, quantity: number): void {
  wizardStore.setState(state => {
    const items = { ...state.items };
    if (quantity <= 0) delete items[foodItemId];
    else items[foodItemId] = quantity;
    return { ...state, items };
  });
}
