import { createStore } from '@tanstack/react-store';
import type { ActivityKind, IsoDate } from '@repo/shared';

export const WIZARD_STEPS = ['date', 'time', 'table', 'food', 'details'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardState {
  step: WizardStep;
  date: IsoDate | null;
  startHour: number | null;
  durationHours: number;
  tableId: number | null;
  /** Kind + label of the picked spot — carried so later steps render and price
   *  it without refetching availability */
  kind: ActivityKind | null;
  tableLabel: string | null;
  /** Sport cards the players will present, 15 zł off each */
  sportCardCount: number;
  /** foodItemId → quantity */
  items: Record<number, number>;
}

const initialState: WizardState = {
  step: 'date',
  date: null,
  startHour: null,
  durationHours: 1,
  tableId: null,
  kind: null,
  tableLabel: null,
  sportCardCount: 0,
  items: {}
};

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
  wizardStore.setState(state => ({ ...state, step }));
}

export function selectDate(date: IsoDate): void {
  wizardStore.setState(state => {
    // Re-confirming the same date keeps downstream picks; a new date invalidates them
    if (state.date === date) return { ...state, step: 'time' };
    return {
      ...state,
      date,
      startHour: null,
      durationHours: 1,
      tableId: null,
      kind: null,
      tableLabel: null,
      step: 'time'
    };
  });
}

export function selectTime(startHour: number, durationHours: number): void {
  wizardStore.setState(state => ({
    ...state,
    startHour,
    durationHours,
    tableId: null,
    kind: null,
    tableLabel: null,
    step: 'table'
  }));
}

export function selectTable(tableId: number, kind: ActivityKind, tableLabel: string): void {
  wizardStore.setState(state => ({ ...state, tableId, kind, tableLabel, step: 'food' }));
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
