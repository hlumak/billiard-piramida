import { CalendarDays, Users } from 'lucide-react';
import type { TournamentDto } from '@repo/shared';
import { formatDayLong } from '../lib/format';
import { isLive, rosterProgress, stateLabel, whenLabel } from '../lib/tournaments';
import { m } from '../paraglide/messages.js';

/** Registration state as a pill: golden while sign-ups are open, muted after. */
export function TournamentBadge({ tournament }: { tournament: TournamentDto }) {
  const live = isLive(tournament.registrationState);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        live ? 'bg-golden text-btn-text' : 'bg-creme/15 text-creme/80'
      }`}
    >
      {stateLabel(tournament.registrationState)}
    </span>
  );
}

/**
 * Seats taken against the number the bracket needs. Renders as a real
 * progressbar so the count is announced, and falls back to the bare count when
 * the club set neither a minimum nor a cap.
 */
export function RosterMeter({ tournament }: { tournament: TournamentDto }) {
  const { taken, target, fraction, label } = rosterProgress(tournament);

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm text-creme">
        <Users className="size-4 shrink-0 text-golden" />
        <span>{label}</span>
      </div>
      {fraction === null || target === null ? null : (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={taken}
          aria-label={label}
          className="mt-1.5 h-2 w-full overflow-hidden rounded-[3px] bg-deep-cream"
        >
          {/* Width is the only animated property — see WizardProgress */}
          <div
            className="h-full rounded-[3px] bg-golden transition-[width] duration-300"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The body of a tournament card, without a surface or a link of its own: the
 * home carousel sits it on the hero photo, the list page on a solid panel, and
 * each supplies its own wrapper.
 */
export function TournamentCardBody({ tournament }: { tournament: TournamentDto }) {
  const when = whenLabel(tournament);
  const { registrationDeadline, registrationState } = tournament;
  // The deadline only informs a decision while it can still be met
  const deadline =
    registrationState === 'open' && registrationDeadline !== null
      ? m.tournament_deadline({ date: formatDayLong(registrationDeadline) })
      : null;

  return (
    <>
      {tournament.imageUrl ? (
        // Decorative: the headline right below carries the same information
        <img src={tournament.imageUrl} alt="" loading="lazy" className="h-24 w-full object-cover" />
      ) : null}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-golden">
            {m.tournament_badge()}
          </span>
          <TournamentBadge tournament={tournament} />
        </div>

        <p className="font-semibold text-creme">{tournament.title}</p>
        {tournament.summary ? (
          <p className="line-clamp-2 text-sm text-creme/85">{tournament.summary}</p>
        ) : null}

        <RosterMeter tournament={tournament} />

        {when !== null || deadline !== null ? (
          <p className="flex items-center gap-1.5 text-xs text-grey-cool">
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="first-letter:uppercase">{when ?? deadline}</span>
          </p>
        ) : null}
      </div>
    </>
  );
}
