import { createStore } from '@tanstack/react-store';
import { defaultGameFor, type ActivityKind, type BilliardGame, type IsoDate } from '@repo/shared';

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
  date: IsoDate | null;
  startHour: number | null;
  durationHours: number;
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
  date: null,
  startHour: null,
  durationHours: 1,
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
    direction: stepIndex(step) < stepIndex(state.step) ? -1 : 1
  }));
}

/** Picking the same date again keeps every later pick; a new one clears them. */
export function selectDate(date: IsoDate): void {
  wizardStore.setState(state =>
    state.date === date ? state : { ...state, date, startHour: null, durationHours: 1, ...noSpot }
  );
}

/** A new start or length may not be free on the spot picked for the old one. */
export function selectStart(startHour: number): void {
  wizardStore.setState(state =>
    state.startHour === startHour ? state : { ...state, startHour, ...noSpot }
  );
}

export function selectDuration(durationHours: number): void {
  wizardStore.setState(state =>
    state.durationHours === durationHours ? state : { ...state, durationHours, ...noSpot }
  );
}

/** Date-free shortcut for a known window (the home page's free-hours strip). */
export function selectTime(startHour: number, durationHours: number): void {
  wizardStore.setState(state => ({
    ...state,
    startHour,
    durationHours,
    ...noSpot,
    step: 'table',
    direction: 1
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
