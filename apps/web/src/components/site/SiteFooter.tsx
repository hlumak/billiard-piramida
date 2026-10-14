import { Link } from '@tanstack/react-router';
import { BrandLogo } from '../BrandLogo';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { weekdayName, warsawToday } from '../../lib/format';
import { VENUE, VENUE_ADDRESS } from '../../lib/venue';
import { groupWeeklyHours, useVenueConfig } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';

const PLAYER_LINKS = [
  { to: '/book', label: () => m.menu_booking() },
  { to: '/bookings', label: () => m.nav_my_bookings() },
  { to: '/prices', label: () => m.menu_prices() }
] as const;

const CLUB_LINKS = [
  { to: '/tournaments', label: () => m.menu_tournaments() },
  { to: '/news', label: () => m.menu_news() },
  { to: '/contacts', label: () => m.nav_contacts() }
] as const;

/** "пн–чт 16–21 · пт 16–23 · сб–нд 15–23" from the live opening hours. */
function useHoursLine(): string {
  const { hours } = useVenueConfig();
  return groupWeeklyHours(hours)
    .map(group => {
      const first = group.weekdays[0] ?? 0;
      const last = group.weekdays.at(-1) ?? first;
      const days =
        first === last
          ? weekdayName(first, 'short')
          : `${weekdayName(first, 'short')}–${weekdayName(last, 'short')}`;
      return group.closed
        ? `${days} ${m.hours_closed()}`
        : `${days} ${group.hours.open}–${group.hours.close}`;
    })
    .join(' · ');
}

function FooterColumn({
  title,
  links
}: {
  title: string;
  links: readonly { to: string; label: () => string }[];
}) {
  return (
    <nav aria-label={title}>
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-golden-light">
        {title}
      </p>
      <ul className="flex flex-col gap-3 text-[15px]">
        {links.map(link => (
          <li key={link.to}>
            <Link to={link.to} className="text-creme transition-colors hover:text-golden">
              {link.label()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * `full` closes the home page: the club in a line, every section, the contacts
 * and the languages, on the deepest green. Every other page ends on the
 * `compact` strip. The footer grows to fill whatever height the page leaves, so
 * a short page never shows a band of the page colour under it.
 */
export function SiteFooter({ variant = 'compact' }: { variant?: 'full' | 'compact' }) {
  const hoursLine = useHoursLine();
  const year = warsawToday().slice(0, 4);

  if (variant === 'compact') {
    return (
      <footer className="mt-24 flex-1 border-t border-line">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-[13px] text-grey-cool md:px-10">
          <span>
            © {year} Piramida · {VENUE.street}, {VENUE.city} · {VENUE.phone}
          </span>
          <LocaleSwitcher />
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-24 flex-1 bg-club-green-deepest md:mt-30">
      <div className="mx-auto grid w-full max-w-[1240px] gap-10 px-5 pt-14 md:px-10 lg:grid-cols-[4fr_2fr_2fr_4fr]">
        <div>
          <BrandLogo className="h-14 w-auto md:h-16" />
          <p className="mt-4 max-w-75 text-sm leading-relaxed text-grey-cool">
            {m.footer_tagline()}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 lg:contents">
          <FooterColumn title={m.footer_players()} links={PLAYER_LINKS} />
          <FooterColumn title={m.footer_club()} links={CLUB_LINKS} />
        </div>
        <div className="flex flex-col gap-2.5 text-[15px] text-cream-soft">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-golden-light">
            {m.nav_contacts()}
          </p>
          <span>{VENUE_ADDRESS}</span>
          <a
            href={`tel:${VENUE.phone.replaceAll(' ', '')}`}
            className="text-cream-soft transition-colors hover:text-golden"
          >
            {VENUE.phone}
          </a>
          <span className="first-letter:uppercase">{hoursLine}</span>
        </div>
      </div>
      <div className="mx-auto mt-12 flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-4 border-t border-line px-5 pt-6 pb-8 md:px-10">
        <span className="text-[13px] text-grey-cool">© {year} Piramida</span>
        <LocaleSwitcher />
      </div>
    </footer>
  );
}
