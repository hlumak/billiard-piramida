import { Link } from '@tanstack/react-router';
import { dateParts, formatPln, type IsoDate, type TournamentDto } from '@repo/shared';
import { dateTileParts, formatDaysFromNow, intlTag, warsawToday } from '../../lib/format';
import { rosterProgress, whenLabel } from '../../lib/tournaments';
import { m } from '../../paraglide/messages.js';

function utcDay(date: IsoDate): number {
  const [y, mo, d] = dateParts(date);
  return Date.UTC(y, mo - 1, d);
}

/** Whole days from today (club calendar) to `date`; negative once it passed. */
function daysUntil(date: IsoDate): number {
  return Math.round((utcDay(date) - utcDay(warsawToday())) / 86_400_000);
}

/** The calendar leaf: weekday, day, month — gold, the card's anchor. */
function DateTile({ date }: { date: IsoDate }) {
  const part = dateTileParts(date);
  return (
    <div
      aria-hidden
      className="flex h-[74px] w-[66px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-golden text-btn-text lg:h-[92px] lg:w-[84px] lg:rounded-2xl"
    >
      <span className="text-[11px] font-bold uppercase lg:text-xs">{part.weekday}</span>
      <span className="text-[26px] leading-[1.05] font-bold lg:text-[34px]">{part.day}</span>
      <span className="text-[10px] font-bold tracking-[0.08em] uppercase lg:text-[11px]">
        {part.month}
      </span>
    </div>
  );
}

/**
 * The next tournament still taking sign-ups, front and centre: when, how full,
 * how many places are left, the fee, and the way in. A deadline is the one
 * thing on the home page that expires, so it earns the first screen.
 */
export function TournamentSpotlight({
  tournament,
  className
}: {
  tournament: TournamentDto;
  className?: string;
}) {
  const { taken, target, fraction, label } = rosterProgress(tournament);
  const placesLeft = target === null ? null : Math.max(target - taken, 0);
  const days = tournament.startsOn === null ? null : daysUntil(tournament.startsOn);
  const when = whenLabel(tournament);
  const fee = tournament.entryFeeGrosz;
  const headingId = `spotlight-${tournament.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={`anim-enter-right rounded-[22px] border-[1.5px] border-golden/70 bg-club-green-dark p-5.5 lg:rounded-3xl lg:bg-club-green-deepest/85 lg:p-7 lg:shadow-[0_24px_60px_rgb(0_0_0/0.35)] lg:backdrop-blur-sm ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold tracking-[0.16em] text-golden-light uppercase lg:text-xs lg:tracking-[0.18em]">
          {m.home_spotlight()}
        </span>
        {days !== null && days >= 0 ? (
          <span className="rounded-full bg-golden/16 px-2.5 py-1 text-[11px] font-bold text-golden-light lg:text-xs">
            {formatDaysFromNow(days)}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3.5 lg:mt-5 lg:gap-4.5">
        {tournament.startsOn !== null ? <DateTile date={tournament.startsOn} /> : null}
        <div className="min-w-0">
          <h2 id={headingId} className="text-[19px] leading-tight font-bold lg:text-2xl">
            {tournament.title}
          </h2>
          {tournament.summary ? (
            <p className="mt-1.5 line-clamp-2 text-[13px] text-grey-cool lg:text-[15px]">
              {tournament.summary}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 lg:mt-5.5">
        <div className="flex justify-between gap-3 text-[13px] lg:text-sm">
          <span className="font-semibold">{label}</span>
          {placesLeft !== null && placesLeft > 0 ? (
            <span className="font-bold text-golden-light">
              {m.tournament_seats_left({ n: placesLeft })}
            </span>
          ) : null}
        </div>
        {fraction === null || target === null ? null : (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(taken, target)}
            aria-label={label}
            className="mt-2 h-2 overflow-hidden rounded-full bg-creme/16"
          >
            <div
              className="anim-bar-fill h-full rounded-full bg-golden"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm lg:mt-4.5">
        {when !== null ? (
          <div>
            <dt className="text-grey-cool">{m.tournament_starts()}</dt>
            <dd className="mt-0.5 font-semibold first-letter:uppercase">{when}</dd>
          </div>
        ) : null}
        {fee !== null ? (
          <div>
            <dt className="text-grey-cool">{m.tournament_fee()}</dt>
            <dd className="mt-0.5 font-semibold">
              {fee === 0 ? m.tournament_fee_free() : formatPln(fee, intlTag())}
            </dd>
          </div>
        ) : null}
      </dl>

      <Link
        to="/tournaments/$slug"
        params={{ slug: tournament.slug }}
        className="btn-gold mt-5 h-12.5 w-full text-[15px] lg:h-13.5 lg:text-base"
      >
        {m.tournament_register_btn()}
      </Link>
      <Link
        to="/tournaments"
        className="mt-3 hidden text-center text-sm font-semibold text-golden-light transition-colors hover:text-golden lg:block"
      >
        {m.tournaments_all()} →
      </Link>
    </article>
  );
}
