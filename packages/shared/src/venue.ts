import type { ActivityKind } from './types.ts';

/**
 * Cloth size of a billiard table. Hall 1 is all 9-foot, hall 2 all 12-foot, and
 * the two bill at different hourly rates — see HOURLY_RATE_GROSZ. Written the
 * way the trade writes it, so it stays "9ft" in every locale.
 */
export type TableSize = '9ft' | '12ft';

/**
 * The room, as built. Single source of truth for what exists to book: the DB
 * `tables` rows are seeded from this, the floor plan draws the same list, and
 * the hourly rate of a spot is looked up through it.
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
  /** Billiard only — a dartboard has no size and bills at the flat darts rate. */
  size?: TableSize;
}

export const SPOTS = [
  { id: 1, label: '1', kind: 'billiard', hall: 1, size: '9ft' },
  { id: 2, label: '2', kind: 'billiard', hall: 1, size: '9ft' },
  { id: 3, label: '3', kind: 'billiard', hall: 1, size: '9ft' },
  { id: 4, label: '4', kind: 'billiard', hall: 1, size: '9ft' },
  { id: 5, label: '5', kind: 'billiard', hall: 1, size: '9ft' },
  { id: 6, label: '1', kind: 'darts', hall: 1 },
  { id: 7, label: '2', kind: 'darts', hall: 1 },
  { id: 8, label: '6', kind: 'billiard', hall: 2, size: '12ft' },
  { id: 9, label: '7', kind: 'billiard', hall: 2, size: '12ft' },
  { id: 10, label: '8', kind: 'billiard', hall: 2, size: '12ft' },
  { id: 11, label: '9', kind: 'billiard', hall: 2, size: '12ft' }
] as const satisfies readonly SpotDef[];

export const SPOTS_COUNT = SPOTS.length;
export const BILLIARD_TABLES_COUNT = SPOTS.filter(s => s.kind === 'billiard').length;
export const DARTBOARDS_COUNT = SPOTS.filter(s => s.kind === 'darts').length;

/** Highest id in use — the upper bound accepted for a booking's spot. */
export const MAX_SPOT_ID = SPOTS.reduce((max, s) => Math.max(max, s.id), 0);

export function hallOf(spotId: number): SpotDef['hall'] | null {
  return SPOTS.find(s => s.id === spotId)?.hall ?? null;
}

/** Cloth size of a billiard table; null for dartboards and unknown ids. */
export function sizeOf(spotId: number): TableSize | null {
  // Widened to SpotDef on purpose: `as const` gives the dartboard entries no
  // `size` key at all, so the literal union has nothing to read it off.
  const spot: SpotDef | undefined = SPOTS.find(s => s.id === spotId);
  return spot?.size ?? null;
}
