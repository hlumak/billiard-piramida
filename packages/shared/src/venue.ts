import type { ActivityKind, BilliardGame } from './types.ts';

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
  /**
   * Billiard only — the cue games this table is equipped for, most likely
   * first (that one is what a booking gets when the guest expresses no
   * preference). Spelled out per table rather than derived from `size`: it is
   * a fact about how the room is kitted out, so a table that gets pool balls
   * tomorrow is one edit here, not a rule to rewrite.
   */
  games?: readonly BilliardGame[];
}

/** Hall 1's 9ft tables are racked for either game; hall 2's 12ft are pyramid only. */
const BOTH_GAMES = ['piramida', 'pool'] as const satisfies readonly BilliardGame[];
const PIRAMIDA_ONLY = ['piramida'] as const satisfies readonly BilliardGame[];

export const SPOTS = [
  { id: 1, label: '1', kind: 'billiard', hall: 1, size: '9ft', games: BOTH_GAMES },
  { id: 2, label: '2', kind: 'billiard', hall: 1, size: '9ft', games: BOTH_GAMES },
  { id: 3, label: '3', kind: 'billiard', hall: 1, size: '9ft', games: BOTH_GAMES },
  { id: 4, label: '4', kind: 'billiard', hall: 1, size: '9ft', games: BOTH_GAMES },
  { id: 5, label: '5', kind: 'billiard', hall: 1, size: '9ft', games: BOTH_GAMES },
  { id: 6, label: '1', kind: 'darts', hall: 1 },
  { id: 7, label: '2', kind: 'darts', hall: 1 },
  { id: 8, label: '6', kind: 'billiard', hall: 2, size: '12ft', games: PIRAMIDA_ONLY },
  { id: 9, label: '7', kind: 'billiard', hall: 2, size: '12ft', games: PIRAMIDA_ONLY },
  { id: 10, label: '8', kind: 'billiard', hall: 2, size: '12ft', games: PIRAMIDA_ONLY },
  { id: 11, label: '9', kind: 'billiard', hall: 2, size: '12ft', games: PIRAMIDA_ONLY }
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

/**
 * Games this spot can host, most likely first. Empty for a dartboard and for
 * an unknown id, which is what makes it safe to drive "does this booking need
 * a game?" straight off the length.
 */
export function gamesFor(spotId: number): readonly BilliardGame[] {
  // Widened to SpotDef for the same reason as sizeOf: the `as const` literals
  // give the dartboard entries no `games` key for the union to read off.
  const spot: SpotDef | undefined = SPOTS.find(s => s.id === spotId);
  return spot?.games ?? [];
}

/** What a spot gets when the guest expresses no preference. */
export function defaultGameFor(spotId: number): BilliardGame | null {
  return gamesFor(spotId)[0] ?? null;
}

export type GameResolution = { ok: true; game: BilliardGame | null } | { ok: false };

/**
 * The game to store against a booking on `spotId`. Shared by the public and
 * the staff create paths, and by the staff edit path, so all three agree on
 * what a dartboard means (`null`) and on which requests are simply impossible
 * — asking for pool on a 12ft table, or for any game on a dartboard.
 */
export function resolveBookingGame(
  spotId: number,
  requested: BilliardGame | undefined
): GameResolution {
  const games = gamesFor(spotId);
  if (games.length === 0) return requested === undefined ? { ok: true, game: null } : { ok: false };
  const game = requested ?? games[0];
  if (game === undefined || !games.includes(game)) return { ok: false };
  return { ok: true, game };
}
