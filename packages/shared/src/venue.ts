import type { ActivityKind } from './types.ts';

/**
 * The room, as built. Single source of truth for what exists to book: the DB
 * `tables` rows are seeded from this, and the floor plan draws the same list.
 *
 * `id` is the permanent booking key and is NEVER renumbered — bookings point at
 * it. `label` is what a guest reads and numbers within the kind, which is why
 * the two diverge: dartboards took ids 6-7 before the second hall opened, so
 * hall 2's tables are ids 8-11 while reading as tables 6-9.
 */
export interface SpotDef {
  id: number;
  label: string;
  kind: ActivityKind;
  /** 1 = main hall (bar side), 2 = back hall */
  hall: 1 | 2;
}

export const SPOTS = [
  { id: 1, label: '1', kind: 'billiard', hall: 1 },
  { id: 2, label: '2', kind: 'billiard', hall: 1 },
  { id: 3, label: '3', kind: 'billiard', hall: 1 },
  { id: 4, label: '4', kind: 'billiard', hall: 1 },
  { id: 5, label: '5', kind: 'billiard', hall: 1 },
  { id: 6, label: '1', kind: 'darts', hall: 1 },
  { id: 7, label: '2', kind: 'darts', hall: 1 },
  { id: 8, label: '6', kind: 'billiard', hall: 2 },
  { id: 9, label: '7', kind: 'billiard', hall: 2 },
  { id: 10, label: '8', kind: 'billiard', hall: 2 },
  { id: 11, label: '9', kind: 'billiard', hall: 2 }
] as const satisfies readonly SpotDef[];

export const SPOTS_COUNT = SPOTS.length;
export const BILLIARD_TABLES_COUNT = SPOTS.filter(s => s.kind === 'billiard').length;
export const DARTBOARDS_COUNT = SPOTS.filter(s => s.kind === 'darts').length;

/** Highest id in use — the upper bound accepted for a booking's spot. */
export const MAX_SPOT_ID = SPOTS.reduce((max, s) => Math.max(max, s.id), 0);

export function hallOf(spotId: number): SpotDef['hall'] | null {
  return SPOTS.find(s => s.id === spotId)?.hall ?? null;
}
