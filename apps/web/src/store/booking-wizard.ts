import { createStore } from '@tanstack/react-store';
import type { IsoDate } from '@repo/shared';

export const WIZARD_STEPS = ['date', 'time', 'table', 'food', 'details'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardState {
  step: WizardStep;
  date: IsoDate | null;
  startHour: number | null;
  durationHours: number;
  tableId: number | null;
  /** foodItemId → quantity */
  items: Record<number, number>;
}

const initialState: WizardState = {
  step: 'date',
  date: null,
  startHour: null,
  durationHours: 1,
  tableId: null,
  items: {}
};

// Module-level singleton: shared across requests during SSR. Safe only while
// mutations happen exclusively from client events — never write to it on the server.
export const wizardStore = createStore<WizardState>(initialState);

export function resetWizard(): void {
  wizardStore.setState(() => initialState);
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
    step: 'table'
  }));
}

export function selectTable(tableId: number): void {
  wizardStore.setState(state => ({ ...state, tableId, step: 'food' }));
}

export function setItemQuantity(foodItemId: number, quantity: number): void {
  wizardStore.setState(state => {
    const items = { ...state.items };
    if (quantity <= 0) delete items[foodItemId];
    else items[foodItemId] = quantity;
    return { ...state, items };
  });
}
