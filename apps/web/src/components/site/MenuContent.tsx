import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronRight, Phone } from 'lucide-react';
import { hoursForDate, isClosedAllDay } from '@repo/shared';
import { BrandLogo } from '../BrandLogo';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { formatHour, warsawToday } from '../../lib/format';
import { VENUE, VENUE_PHONE_HREF } from '../../lib/venue';
import { useVenueConfig } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';
import { MENU_LINKS } from './nav';

/**
 * What the phone menu holds: the booking call to action, every section, today's
 * hours with a one-tap call, and the languages. Rendered inside the sheet the
 * burger opens, and as the /menu page for anyone who reaches it without
 * JavaScript (the burger is a real link to it).
 */
export function MenuContent({
  onNavigate,
  closeControl,
  tournamentsOpen = false
}: {
  /** Closes the sheet; every link calls it on the way out */
  onNavigate?: () => void;
  /** The sheet's close button, or nothing on the standalone page */
  closeControl?: ReactNode;
  /** A tournament is taking sign-ups: worth a badge on its row */
  tournamentsOpen?: boolean;
}) {
  const today = hoursForDate(warsawToday(), useVenueConfig().hours);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-7">
      <div className="flex h-19 shrink-0 items-center justify-between">
        <Link to="/" onClick={onNavigate} aria-label={m.nav_home()}>
          <BrandLogo className="h-[42px] w-auto" />
        </Link>
        {closeControl}
      </div>

      <Link
        to="/book"
        onClick={onNavigate}
        className="btn-gold anim-stagger-item mt-5 h-14 justify-between px-5 text-[17px]"
      >
        {m.home_cta_book()}
        <ArrowRight className="size-5" strokeWidth={2.4} aria-hidden />
      </Link>

      <nav aria-label={m.nav_main()} className="mt-4">
        <ul>
          {MENU_LINKS.map(link => (
            <li key={link.to} className="anim-stagger-item border-b border-line last:border-b-0">
              <Link
                to={link.to}
                onClick={onNavigate}
                className="group flex h-15 items-center gap-2.5 text-lg font-semibold text-creme"
              >
                {link.label()}
                {link.to === '/tournaments' && tournamentsOpen ? (
                  <span className="rounded-full bg-golden/18 px-2.5 py-0.5 text-xs font-bold text-golden-light">
                    {m.tournament_state_open()}
                  </span>
                ) : null}
                <ChevronRight
                  aria-hidden
                  className="ml-auto size-5 text-grey-cool transition-transform group-hover:translate-x-1"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-4 pt-8">
        <div className="card flex items-center gap-3.5 rounded-2xl px-4.5 py-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-golden" />
              {isClosedAllDay(today)
                ? m.closed_today()
                : m.open_today({ open: formatHour(today.open), close: formatHour(today.close) })}
            </p>
            <p className="mt-1 truncate text-[13px] text-grey-cool">{VENUE.street}</p>
          </div>
          <a
            href={VENUE_PHONE_HREF}
            aria-label={`${m.call_us()}: ${VENUE.phone}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-golden text-golden transition-colors hover:bg-golden/10"
          >
            <Phone className="size-5" aria-hidden />
          </a>
        </div>
        <LocaleSwitcher stretch />
      </div>
    </div>
  );
}
