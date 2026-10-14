import { Link } from '@tanstack/react-router';
import { formatPln, type TournamentDto } from '@repo/shared';
import { resolveAssetUrl } from '../lib/api';
import { intlTag } from '../lib/format';
import { isLive, rosterProgress, stateLabel, whenLabel } from '../lib/tournaments';
import { m } from '../paraglide/messages.js';
import { DateBadge } from './DateBadge';

/** Registration state as a pill: golden while sign-ups are open, muted after. */
export function TournamentBadge({ tournament }: { tournament: TournamentDto }) {
  const live = isLive(tournament.registrationState);
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-bold md:text-[13px] ${
        live ? 'bg-golden text-btn-text' : 'bg-creme/12 text-cream-soft'
      }`}
    >
      {stateLabel(tournament.registrationState)}
    </span>
  );
}

/**
 * A tournament in the list: its day, state, name and pitch, then how full the
 * roster is, when it starts and what it costs. The whole card is the link.
 */
export function TournamentCard({ tournament }: { tournament: TournamentDto }) {
  const live = isLive(tournament.registrationState);
  const { taken, target, fraction, label } = rosterProgress(tournament);
  const placesLeft = target === null ? null : Math.max(target - taken, 0);
  const when = whenLabel(tournament);
  const fee = tournament.entryFeeGrosz;

  return (
    <Link
      to="/tournaments/$slug"
      params={{ slug: tournament.slug }}
      className={`card lift flex h-full flex-col overflow-hidden ${
        tournament.registrationState === 'cancelled' ? 'opacity-60' : ''
      }`}
    >
      {tournament.imageUrl ? (
        // Decorative: the headline right below carries the same information
        <img
          src={resolveAssetUrl(tournament.imageUrl)}
          alt=""
          loading="lazy"
          className="h-36 w-full object-cover"
        />
      ) : null}
      <div className="flex flex-1 flex-col p-5 md:p-6">
        <div className="flex items-start gap-4">
          {tournament.startsOn !== null ? (
            <DateBadge date={tournament.startsOn} muted={!live} />
          ) : null}
          <div className="min-w-0 flex-1">
            <TournamentBadge tournament={tournament} />
            <h2 className="mt-2 text-lg leading-snug font-bold md:text-xl">{tournament.title}</h2>
            {tournament.summary ? (
              <p className="mt-1 line-clamp-2 text-sm text-grey-cool">{tournament.summary}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-auto pt-5">
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-semibold">{label}</span>
            {live && placesLeft !== null && placesLeft > 0 ? (
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
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-creme/16"
            >
              <div
                className="anim-bar-fill h-full rounded-full bg-golden"
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-grey-cool">{m.tournament_starts()}</dt>
              <dd className="mt-0.5 font-semibold first-letter:uppercase">
                {when ?? m.tournament_date_tbd({ n: tournament.minPlayers })}
              </dd>
            </div>
            <div>
              <dt className="text-grey-cool">{m.tournament_fee()}</dt>
              <dd className="mt-0.5 font-semibold">
                {fee === null
                  ? m.tournament_fee_tbd()
                  : fee === 0
                    ? m.tournament_fee_free()
                    : formatPln(fee, intlTag())}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Link>
  );
}
