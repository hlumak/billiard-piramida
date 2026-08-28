import {
  rosterTarget,
  type TournamentDto,
  type TournamentRegistrationState,
  type TournamentStatus
} from '@repo/shared';
import { formatDayLong, formatHour } from './format';
import { m } from '../paraglide/messages.js';

/** The one place a registration state turns into words — badge, list and page share it. */
export function stateLabel(state: TournamentRegistrationState): string {
  switch (state) {
    case 'open':
      return m.tournament_state_open();
    case 'full':
      return m.tournament_state_full();
    case 'deadline_passed':
      return m.tournament_state_deadline_passed();
    case 'closed':
      return m.tournament_state_closed();
    case 'completed':
      return m.tournament_state_completed();
    case 'cancelled':
      return m.tournament_state_cancelled();
  }
}

/** Only an open tournament earns the golden badge; the rest read as past tense. */
export function isLive(state: TournamentRegistrationState): boolean {
  return state === 'open';
}

/** "четвер, 3 вересня · 18:00" — null while the date waits on the roster. */
export function whenLabel(
  tournament: Pick<TournamentDto, 'startsOn' | 'startHour'>
): string | null {
  const { startsOn, startHour } = tournament;
  if (startsOn === null) return null;
  const day = formatDayLong(startsOn);
  return startHour === null ? day : `${day} · ${formatHour(startHour)}`;
}

export interface RosterProgress {
  /** Seats held: confirmed sign-ups plus those still owing the fee */
  taken: number;
  /** Players the bracket is waiting for, or null when the club set no number */
  target: number | null;
  /** 0–1 for the meter; null when there is nothing to measure against */
  fraction: number | null;
  label: string;
}

export function rosterProgress(tournament: TournamentDto): RosterProgress {
  const taken = tournament.confirmedCount + tournament.pendingCount;
  const target = rosterTarget(tournament);
  return {
    taken,
    target,
    // Clamped: staff can add walk-ins past the cap, and a bar past 100% looks broken
    fraction: target === null ? null : Math.min(taken / target, 1),
    label:
      target === null
        ? m.tournament_players_open({ n: taken })
        : m.tournament_players({ n: taken, total: target })
  };
}

/** Lifecycle status, staff wording — distinct from the public registration state. */
export function adminStatusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'draft':
      return m.admin_status_draft();
    case 'registration':
      return m.admin_status_registration();
    case 'closed':
      return m.admin_status_closed();
    case 'completed':
      return m.admin_status_completed();
    case 'cancelled':
      return m.admin_status_cancelled();
  }
}
