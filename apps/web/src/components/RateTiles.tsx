import { Link } from '@tanstack/react-router';
import { SPOTS, type RateTier } from '@repo/shared';
import { intlTag } from '../lib/format';
import { useVenueConfig } from '../lib/venue-config';
import { m } from '../paraglide/messages.js';

/** How many spots bill at each tier — counted from the room, not typed in. */
function countOf(tier: RateTier): number {
  return SPOTS.filter(spot =>
    tier === 'darts' ? spot.kind === 'darts' : 'size' in spot && spot.size === tier
  ).length;
}

/** The hall a size lives in, for the badge ("Hall 2 · 4 tables"). */
function hallOf(tier: '9ft' | '12ft'): number {
  return SPOTS.find(spot => 'size' in spot && spot.size === tier)?.hall ?? 1;
}

const TIERS = [
  {
    tier: '9ft',
    title: () => m.table_n({ n: '9ft' }),
    badge: () => `${m.hall_n({ n: hallOf('9ft') })} · ${m.tables_n({ n: countOf('9ft') })}`,
    description: () => m.price_9ft_desc()
  },
  {
    tier: '12ft',
    title: () => m.table_n({ n: '12ft' }),
    badge: () => `${m.hall_n({ n: hallOf('12ft') })} · ${m.tables_n({ n: countOf('12ft') })}`,
    description: () => m.price_12ft_desc()
  },
  {
    tier: 'darts',
    title: () => m.activity_darts(),
    badge: () => m.dartboards_n({ n: countOf('darts') }),
    description: () => m.price_darts_desc()
  }
] as const;

/**
 * The three hourly rates as tiles: what it is, where it is, what it costs. The
 * rates are the live venue config, so a price change shows everywhere at once.
 * `withBooking` adds a "book" link under each (the prices page).
 */
export function RateTiles({ withBooking = false }: { withBooking?: boolean }) {
  const { rates } = useVenueConfig();
  const number = new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 2 });

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-6">
      {TIERS.map(({ tier, title, badge, description }) => (
        <li
          key={tier}
          className="card anim-stagger-item flex items-center gap-4 rounded-[18px] p-4.5 md:flex-col md:items-stretch md:gap-0 md:rounded-[20px] md:p-7"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[17px] font-bold md:text-xl">{title()}</p>
              <span className="hidden rounded-full bg-club-green-light px-2.5 py-1 text-xs font-semibold md:inline">
                {badge()}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-grey-cool md:mt-2 md:text-[15px]">
              {description()}
              <span className="md:hidden"> · {badge()}</span>
            </p>
          </div>
          <p className="flex shrink-0 flex-col items-end md:mt-7 md:flex-row md:items-baseline md:gap-2">
            <span className="text-[28px] leading-none font-bold text-golden tabular-nums md:text-[46px]">
              {number.format(rates[tier] / 100)}
            </span>
            <span className="mt-0.5 text-xs text-grey-cool md:mt-0 md:text-[15px]">
              {m.rate_unit()}
            </span>
          </p>
          {withBooking ? (
            <Link
              to="/book"
              className="mt-5.5 hidden text-[15px] font-bold text-golden transition-colors hover:text-golden-hover md:block"
            >
              {m.book_this()} {title()} →
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
