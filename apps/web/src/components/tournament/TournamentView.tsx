import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Banknote, CalendarDays, Clock, Users, type LucideIcon } from 'lucide-react';
import { formatPln, type TournamentDto } from '@repo/shared';
import { TournamentBadge } from '../TournamentCard';
import { TournamentRegisterForm } from './TournamentRegisterForm';
import { formatDayLong, formatDayMonth, intlTag } from '../../lib/format';
import { rosterProgress, stateLabel, whenLabel } from '../../lib/tournaments';
import { m } from '../../paraglide/messages.js';

/**
 * Staff-authored plain text, split on blank lines. A paragraph's text is its
 * identity; a repeated one (a "—" divider) also gets its occurrence number.
 */
function keyedParagraphs(details: string): { key: string; text: string }[] {
  const seen = new Map<string, number>();
  return details.split(/\n{2,}/).map(text => {
    const occurrence = (seen.get(text) ?? 0) + 1;
    seen.set(text, occurrence);
    return { key: `${occurrence}:${text}`, text };
  });
}

/** One fact tile: an icon, what it is, and the value. */
function Fact({
  icon: Icon,
  label,
  value,
  className = '',
  children
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`card anim-stagger-item p-5 md:p-5.5 ${className}`}>
      <div className="flex gap-3.5">
        <Icon aria-hidden className="mt-0.5 size-5.5 flex-none text-golden" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-grey-cool">{label}</p>
          <p className="mt-1 font-bold first-letter:uppercase md:text-[17px]">{value}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Seats taken against the roster the bracket needs, as a bar with the split under it. */
function Roster({ tournament, className }: { tournament: TournamentDto; className: string }) {
  const { taken, target, fraction, label } = rosterProgress(tournament);
  return (
    <Fact icon={Users} label={m.tournament_players_label()} value={label} className={className}>
      {fraction === null || target === null ? null : (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(taken, target)}
          aria-label={label}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-creme/16"
        >
          <div
            className="anim-bar-fill h-full rounded-full bg-golden"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-[13px] text-grey-cool">
        {m.tournament_confirmed_n({ n: tournament.confirmedCount })} ·{' '}
        {m.tournament_pending_n({ n: tournament.pendingCount })}
      </p>
    </Fact>
  );
}

/**
 * The tournament announcement: its state and title across the top, then the
 * facts and the details beside the sign-up card, which stays in view (sticky)
 * while the details are read.
 */
export function TournamentView({ tournament }: { tournament: TournamentDto }) {
  const when = whenLabel(tournament);
  const { entryFeeGrosz, registrationDeadline, registrationState, minPlayers } = tournament;
  const [registered, setRegistered] = useState(false);
  const open = registrationState === 'open';
  // The roster, with its bar, and the date (the longest value) each take a
  // row; the deadline and the fee share the last. Side by side with the
  // roster, the one-line facts were cards of empty space, and three abreast
  // the date broke over three lines.
  const lastSpan = registrationDeadline === null ? 'sm:col-span-2' : '';

  return (
    <div>
      <header className="anim-reveal">
        <Link
          to="/tournaments"
          className="text-sm font-semibold text-golden-light transition-colors hover:text-golden"
        >
          ← {m.tournaments_all()}
        </Link>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <TournamentBadge tournament={tournament} />
          {open && registrationDeadline !== null ? (
            <span className="text-sm text-grey-cool">
              {m.tournament_until({ date: formatDayMonth(registrationDeadline) })}
            </span>
          ) : null}
        </div>
        <h1 className="mt-4 text-[32px] leading-[1.1] font-bold tracking-[-0.01em] md:text-[46px]">
          {tournament.title}
        </h1>
        {tournament.summary ? (
          <p className="mt-3 text-[17px] text-cream-soft md:text-[19px]">{tournament.summary}</p>
        ) : null}
      </header>

      {/* Facts, sign-up, details: in that order on a phone, so the card is not
          buried under the description; on a wide screen the card takes the
          right column across both rows and stays in view (sticky) */}
      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-0">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-start-1">
          <Roster tournament={tournament} className="sm:col-span-2" />
          <Fact
            className="sm:col-span-2"
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
            className={lastSpan}
            icon={Banknote}
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
        </div>

        <aside className="anim-reveal [animation-delay:150ms] lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {/* Stays up after a sign-up even if that seat filled the roster, so
              the success panel isn't swapped for "full" under the new player */}
          {open || registered ? (
            <TournamentRegisterForm
              tournament={tournament}
              onRegistered={() => setRegistered(true)}
            />
          ) : (
            <p className="card p-6 text-center text-grey-cool">{stateLabel(registrationState)}</p>
          )}
        </aside>

        {tournament.details ? (
          <section className="anim-reveal lg:col-start-1 lg:mt-10">
            <h2 className="text-[22px] font-bold">{m.tournament_details()}</h2>
            {/* Staff-authored plain text: blank lines are the paragraph breaks */}
            <div className="mt-3 flex max-w-[640px] flex-col gap-3 leading-[1.7] text-cream-soft">
              {keyedParagraphs(tournament.details).map(({ key, text }) => (
                <p key={key}>{text}</p>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
