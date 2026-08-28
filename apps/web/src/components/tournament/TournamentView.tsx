import { Link } from '@tanstack/react-router';
import { CalendarDays, CircleDollarSign, Clock } from 'lucide-react';
import { formatPln, type TournamentDto } from '@repo/shared';
import { TournamentBadge, RosterMeter } from '../TournamentCard';
import { TournamentRegisterForm } from './TournamentRegisterForm';
import { Reveal } from '../motion';
import { formatDayLong, intlTag } from '../../lib/format';
import { stateLabel, whenLabel } from '../../lib/tournaments';
import { m } from '../../paraglide/messages.js';

/** One labelled line of the fact block: when, sign-up deadline, entry fee. */
function Fact({
  icon: Icon,
  label,
  value
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-golden" />
      <div>
        <p className="text-xs text-grey-cool">{label}</p>
        <p className="font-medium text-creme first-letter:uppercase">{value}</p>
      </div>
    </div>
  );
}

/** The tournament announcement itself: facts, details and the sign-up form. */
export function TournamentView({ tournament }: { tournament: TournamentDto }) {
  const when = whenLabel(tournament);
  const { entryFeeGrosz, registrationDeadline, registrationState, minPlayers } = tournament;

  return (
    <div className="flex flex-col gap-6">
      <Reveal className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TournamentBadge tournament={tournament} />
        </div>
        {/* PageHeader owns the page's h1, so the announcement heads at h2 */}
        <h2 className="text-2xl font-bold text-creme">{tournament.title}</h2>
        {tournament.summary ? <p className="text-creme/85">{tournament.summary}</p> : null}
      </Reveal>

      <Reveal delay={0.05} className="flex flex-col gap-4 rounded-[10px] bg-club-green-light p-4">
        <Fact
          icon={CalendarDays}
          label={m.tournament_when()}
          // No date yet is information, not a gap: it says what has to happen first
          value={when ?? m.tournament_date_tbd({ n: minPlayers })}
        />
        {registrationDeadline !== null ? (
          <Fact
            icon={Clock}
            label={m.tournament_deadline_label()}
            value={formatDayLong(registrationDeadline)}
          />
        ) : null}
        <Fact
          icon={CircleDollarSign}
          label={m.tournament_fee()}
          // null is "not priced yet", which is not the same as free — saying
          // "free" for a tournament that charges at the desk misleads.
          value={
            entryFeeGrosz === null
              ? m.tournament_fee_tbd()
              : entryFeeGrosz === 0
                ? m.tournament_fee_free()
                : formatPln(entryFeeGrosz, intlTag())
          }
        />
        <RosterMeter tournament={tournament} />
        <p className="text-xs text-grey-cool">
          {m.tournament_confirmed_n({ n: tournament.confirmedCount })} ·{' '}
          {m.tournament_pending_n({ n: tournament.pendingCount })}
        </p>
      </Reveal>

      {tournament.details ? (
        <Reveal delay={0.1}>
          <h3 className="mb-2 text-lg font-semibold text-golden">{m.tournament_details()}</h3>
          {/* Staff-authored plain text: blank lines are the paragraph breaks */}
          <div className="flex flex-col gap-3 text-creme/85">
            {tournament.details.split(/\n{2,}/).map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={0.15}>
        {registrationState === 'open' ? (
          <TournamentRegisterForm tournament={tournament} />
        ) : (
          <p className="rounded-[10px] bg-club-green-light p-4 text-center text-grey-cool">
            {stateLabel(registrationState)}
          </p>
        )}
      </Reveal>

      <Link to="/tournaments" className="text-center font-semibold text-golden hover:underline">
        {m.tournaments_all()}
      </Link>
    </div>
  );
}
