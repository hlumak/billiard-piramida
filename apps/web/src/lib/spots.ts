import type { ActivityKind, BilliardGame, TableSize } from '@repo/shared';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

/**
 * A bookable spot is a billiard table or a dartboard. Everything user-facing
 * goes through these so no screen ever calls a dartboard "Table 6" — spot ids
 * are global, but the label a guest sees numbers within the kind.
 */

export function spotName(kind: ActivityKind, label: string | number): string {
  return kind === 'darts' ? m.dartboard_n({ n: label }) : m.table_n({ n: label });
}

export function spotSummaryLabel(kind: ActivityKind): string {
  return kind === 'darts' ? m.summary_dartboard() : m.summary_table();
}

export function spotRentalLabel(kind: ActivityKind): string {
  return kind === 'darts' ? m.dartboard_rental() : m.table_rental();
}

export function activityName(kind: ActivityKind): string {
  return kind === 'darts' ? m.activity_darts() : m.activity_billiard();
}

/** Which cue game the table is racked for — billiard only, never a dartboard. */
export function gameName(game: BilliardGame): string {
  return game === 'pool' ? m.game_pool() : m.game_piramida();
}

/**
 * "Table 6 · 12ft · Pyramid": the spot, then its size and game where the caller
 * passes them — a dartboard has neither, and a booking made before the club
 * began recording the game has none. `lowercaseGame` writes it "· pyramid",
 * a trailing detail of the line rather than a name standing on its own.
 */
export function spotDescription(
  kind: ActivityKind,
  label: string | number,
  {
    size = null,
    game = null,
    lowercaseGame = false
  }: { size?: TableSize | null; game?: BilliardGame | null; lowercaseGame?: boolean } = {}
): string {
  const gameText = game ? gameName(game) : null;
  return [
    spotName(kind, label),
    size,
    lowercaseGame ? gameText?.toLocaleLowerCase(getLocale()) : gameText
  ]
    .filter(Boolean)
    .join(' · ');
}

export const ACTIVITY_KINDS = ['billiard', 'darts'] as const satisfies readonly ActivityKind[];
