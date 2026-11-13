import type { ClosureDto } from './closures.ts';
import { addDays, MAX_CLOSE_HOUR, type IsoDate } from './schedule.ts';

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

/**
 * How long an unpaid online sign-up holds its seat. Sign-ups are anonymous
 * and unverified, so without this anyone could fill a capped roster (or
 * squat someone else's number) with pending seats nobody will pay for.
 * A lapsed pending seat stays on the staff roster, but no longer counts
 * toward "full" — and the same phone may sign up again over it.
 */
export const PENDING_SEAT_HOLD_MS = 72 * 3_600_000;

/** Everything `registrationStateOf` needs — the DTO and the DB row both satisfy it. */
export interface RegistrationWindow {
  status: TournamentStatus;
  /** Play day; sign-ups stop once it is over, even with no deadline set */
  startsOn: IsoDate | null;
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
  const { status, startsOn, registrationDeadline, maxPlayers, takenSeats } = tournament;
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  if (status !== 'registration') return 'closed';
  // Played, and staff have not moved it on yet: a walk-in can still sign up on
  // the day itself, never after it
  if (startsOn !== null && today > startsOn) return 'closed';
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

/**
 * Does a tournament in this status hold its tables? A draft is not announced
 * yet and a cancelled one is not played, so neither closes anything; every
 * other status keeps the time it was played in closed, past ones included.
 */
export function tournamentHoldsTables(status: TournamentStatus): boolean {
  return status !== 'draft' && status !== 'cancelled';
}

/**
 * Is `endHour` a valid end for a tournament starting at `startHour`? On the
 * club day's scale: after the start, up to MAX_CLOSE_HOUR (02:00 the morning
 * after), the same reach as the latest closing hour.
 */
export function isTournamentEndHour(startHour: number, endHour: number): boolean {
  return Number.isInteger(endHour) && endHour > startHour && endHour <= MAX_CLOSE_HOUR;
}

/**
 * The stretch a tournament closes its tables for, in the closure's terms
 * (calendar date + hour, end exclusive), or null while its day, start or end
 * is not set or the end does not come after the start. An end past 24 is the
 * morning after: 25 is 01:00 of the next date.
 */
export function tournamentClosureRange(tournament: {
  startsOn: IsoDate | null;
  startHour: number | null;
  endHour: number | null;
}): Pick<ClosureDto, 'startDate' | 'startHour' | 'endDate' | 'endHour'> | null {
  const { startsOn, startHour, endHour } = tournament;
  if (startsOn === null || startHour === null || endHour === null) return null;
  if (!isTournamentEndHour(startHour, endHour)) return null;
  return {
    startDate: startsOn,
    startHour,
    endDate: endHour >= 24 ? addDays(startsOn, 1) : startsOn,
    endHour: endHour % 24
  };
}
