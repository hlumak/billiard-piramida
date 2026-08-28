import type { IsoDate } from './schedule.ts';

/**
 * Club tournaments. The entry fee is paid in person at the reception desk, so a
 * sign-up made on the site is only ever a `pending` seat until staff confirm it
 * — see `TournamentRegistrationStatus`.
 */
export const TOURNAMENT_STATUSES = [
  /** Staff-only draft: absent from every public endpoint */
  'draft',
  /** Announced and accepting sign-ups */
  'registration',
  /** Announced, sign-ups shut (roster settled, or waiting on the playing date) */
  'closed',
  'completed',
  'cancelled'
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_REGISTRATION_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;

/** `pending` = signed up online, `confirmed` = fee paid at the reception desk. */
export type TournamentRegistrationStatus = (typeof TOURNAMENT_REGISTRATION_STATUSES)[number];

/** Why the sign-up form is — or is not — offered. Derived, never stored. */
export type TournamentRegistrationState =
  | 'open'
  | 'full'
  | 'deadline_passed'
  | 'closed'
  | 'completed'
  | 'cancelled';

/**
 * Ceiling on a roster and on one tournament's sign-ups. The club runs 16-player
 * brackets; this is far above that and only exists to bound the admin schema
 * and the seat arithmetic.
 */
export const MAX_TOURNAMENT_PLAYERS = 256;

/** Everything `registrationStateOf` needs — the DTO and the DB row both satisfy it. */
export interface RegistrationWindow {
  status: TournamentStatus;
  /** Last day sign-ups are accepted, inclusive */
  registrationDeadline: IsoDate | null;
  maxPlayers: number | null;
  /** confirmed + pending: an unpaid sign-up holds its seat until staff drop it */
  takenSeats: number;
}

/**
 * A deadline passes and a roster fills with nobody touching the row, so the
 * state a visitor sees cannot be a stored column. Both sides derive it from the
 * same function: the API sends its verdict in the DTO, the client renders it.
 *
 * `today` is the venue-local calendar date. YYYY-MM-DD sorts lexicographically
 * the way it sorts chronologically, so the deadline is a plain string compare.
 */
export function registrationStateOf(
  tournament: RegistrationWindow,
  today: IsoDate
): TournamentRegistrationState {
  const { status, registrationDeadline, maxPlayers, takenSeats } = tournament;
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  if (status !== 'registration') return 'closed';
  if (maxPlayers !== null && takenSeats >= maxPlayers) return 'full';
  // Inclusive: "до 30.08" means a sign-up still lands on the 30th
  if (registrationDeadline !== null && today > registrationDeadline) return 'deadline_passed';
  return 'open';
}

/**
 * Progress towards playing the tournament: the bracket needs `minPlayers` before
 * it runs, and `maxPlayers` (when set) is where sign-ups stop. Returns null when
 * neither is set — nothing to draw a bar against.
 */
export function rosterTarget(tournament: {
  minPlayers: number;
  maxPlayers: number | null;
}): number | null {
  const { minPlayers, maxPlayers } = tournament;
  if (maxPlayers !== null) return maxPlayers;
  return minPlayers > 0 ? minPlayers : null;
}
