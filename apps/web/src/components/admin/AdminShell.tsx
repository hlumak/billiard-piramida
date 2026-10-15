import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Ellipsis, ExternalLink, LogOut, Search, X } from 'lucide-react';
import { hoursForDate, isClosedAllDay } from '@repo/shared';
import { formatDayLong, formatHour, warsawToday } from '../../lib/format';
import { useNowMinute } from '../../lib/use-now';
import { useVenueConfig } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';
import { BrandLogo } from '../BrandLogo';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { AdminNewBooking } from './AdminBookingModal';
import { ADMIN_GROUPS, ADMIN_PANES, type AdminPaneId } from './panes';

interface ShellProps {
  pane: AdminPaneId;
  onSelect: (pane: AdminPaneId) => void;
  /** The header's phone search hands the number to the bookings pane */
  onSearchPhone: (phone: string) => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  logoutFailed: boolean;
  children: ReactNode;
}

const navItem =
  'flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold text-cream-soft transition-colors hover:bg-creme/6 aria-[current=page]:bg-golden/15 aria-[current=page]:font-bold aria-[current=page]:text-golden-light';

/** Every section, grouped as the sidebar groups them; the phone's "More" sheet reuses it. */
function PaneNav({
  pane,
  onSelect,
  labelId
}: {
  pane: AdminPaneId;
  onSelect: (pane: AdminPaneId) => void;
  labelId: string;
}) {
  return (
    <nav aria-labelledby={labelId} className="flex flex-col gap-5">
      <span id={labelId} className="sr-only">
        {m.admin_sections()}
      </span>
      {ADMIN_GROUPS.map(group => (
        <div key={group.id}>
          <p className="mb-1.5 px-3 text-[11px] font-bold tracking-[0.16em] text-grey-cool/80 uppercase">
            {group.label()}
          </p>
          {ADMIN_PANES.filter(entry => entry.group === group.id).map(entry => (
            <button
              key={entry.id}
              type="button"
              aria-current={entry.id === pane ? 'page' : undefined}
              onClick={() => onSelect(entry.id)}
              className={navItem}
            >
              <entry.icon aria-hidden className="size-5 flex-none" strokeWidth={2} />
              {entry.label()}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Open site, language, sign out: the foot of the sidebar and of the "More" sheet. */
function SessionControls({
  onLogout,
  isLoggingOut,
  logoutFailed
}: Pick<ShellProps, 'onLogout' | 'isLoggingOut' | 'logoutFailed'>) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        to="/"
        className="flex items-center gap-2 px-2 text-sm font-semibold text-golden-light hover:text-golden"
      >
        <ExternalLink aria-hidden className="size-4" />
        {m.admin_open_site()}
      </Link>
      <LocaleSwitcher stretch className="bg-club-green" />
      <button
        type="button"
        onClick={onLogout}
        disabled={isLoggingOut}
        aria-busy={isLoggingOut}
        className="btn-outline h-10.5 rounded-xl border-creme/20 text-sm"
      >
        <LogOut aria-hidden className="size-4" />
        {m.admin_logout()}
      </button>
      {logoutFailed ? (
        <p role="alert" className="text-sm text-danger-soft-foreground">
          {m.err_signout_failed()}
        </p>
      ) : null}
    </div>
  );
}

function PhoneSearch({ onSearch }: { onSearch: (phone: string) => void }) {
  const [value, setValue] = useState('');
  const id = useId();
  return (
    <form
      role="search"
      onSubmit={event => {
        event.preventDefault();
        if (value.trim()) onSearch(value.trim());
      }}
      className="flex h-11 w-70 items-center gap-2.5 rounded-xl bg-club-green-light px-3.5 focus-within:ring-2 focus-within:ring-golden"
    >
      <Search aria-hidden className="size-4.5 flex-none text-grey-cool" />
      <label htmlFor={id} className="sr-only">
        {m.admin_search_phone()}
      </label>
      <input
        id={id}
        type="search"
        inputMode="tel"
        value={value}
        onChange={event => setValue(event.target.value)}
        placeholder={m.admin_search_phone()}
        className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-grey-cool/80"
      />
    </form>
  );
}

/**
 * The staff panel's frame: a sidebar of sections on a wide screen, and on a
 * phone a compact header with a bottom bar of the three daily sections plus
 * "More". The header names the section and today's hours, and keeps the
 * two things the desk reaches for most: find a client by phone, and book.
 */
export function AdminShell({
  pane,
  onSelect,
  onSearchPhone,
  onLogout,
  isLoggingOut,
  logoutFailed,
  children
}: ShellProps) {
  const current = ADMIN_PANES.find(entry => entry.id === pane) ?? ADMIN_PANES[0];
  const { hours } = useVenueConfig();
  const today = warsawToday(useNowMinute());
  const day = hoursForDate(today, hours);
  const hoursText = isClosedAllDay(day)
    ? m.admin_closed_today()
    : m.admin_open_hours({ open: formatHour(day.open), close: formatHour(day.close) });
  const sideNavId = useId();
  const sheetNavId = useId();
  const sheet = useRef<HTMLDialogElement>(null);

  const select = (next: AdminPaneId) => {
    sheet.current?.close();
    onSelect(next);
  };

  // The sheet is phone-only (hidden from lg up). A tablet rotated past that
  // width with it open would keep an invisible modal that makes the whole
  // panel inert, with no Escape key to close it: close it on the way.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 64rem)');
    const onChange = () => {
      if (wide.matches) sheet.current?.close();
    };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);
  const sessionProps = { onLogout, isLoggingOut, logoutFailed };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* The column carries the ground all the way down; the sidebar inside rides along */}
      <div className="hidden border-r border-creme/10 bg-club-green-dark lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto px-4 py-6">
          <div className="flex items-center gap-3 px-2">
            <BrandLogo className="h-10 w-auto" />
            <span className="text-[11px] font-bold tracking-[0.16em] text-grey-cool uppercase">
              {m.admin_staff()}
            </span>
          </div>
          <PaneNav pane={pane} onSelect={select} labelId={sideNavId} />
          <div className="mt-auto px-1">
            <SessionControls {...sessionProps} />
          </div>
        </aside>
      </div>

      <div className="min-w-0 pb-28 lg:pb-0">
        <header className="hidden h-21 items-center gap-5 border-b border-line px-9 lg:flex">
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] leading-tight font-bold">{current.label()}</h1>
            <p className="mt-0.5 text-sm text-grey-cool first-letter:uppercase">
              {formatDayLong(today)} · {hoursText}
            </p>
          </div>
          <PhoneSearch onSearch={onSearchPhone} />
          <AdminNewBooking />
        </header>

        {/* Above the schedule's sticky name column (z-20) as it scrolls under */}
        <header className="sticky top-0 z-30 flex h-17 items-center gap-3 border-b border-line bg-club-green-dark px-4 lg:hidden">
          <BrandLogo className="h-8 w-auto" />
          <div className="min-w-0 flex-1">
            {/* The page's heading on a phone; the wide header's h1 is not rendered there */}
            <h1 className="truncate text-lg leading-tight font-bold">{current.label()}</h1>
            <p className="truncate text-xs text-grey-cool first-letter:uppercase">
              {formatDayLong(today)}
            </p>
          </div>
          <AdminNewBooking />
        </header>

        <main id="main" className="px-4 pt-4 pb-6 md:px-6 lg:px-9 lg:pt-7 lg:pb-12">
          {children}
        </main>
      </div>

      <nav
        aria-label={m.admin_sections()}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-club-green-dark px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
      >
        {ADMIN_PANES.filter(entry => entry.phone).map(entry => (
          <button
            key={entry.id}
            type="button"
            aria-current={entry.id === pane ? 'page' : undefined}
            onClick={() => select(entry.id)}
            className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold text-cream-soft aria-[current=page]:font-bold aria-[current=page]:text-golden-light"
          >
            <entry.icon aria-hidden className="size-5.5" strokeWidth={2} />
            {entry.label()}
          </button>
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          // Any section that lives behind "More" lights "More" itself up
          aria-current={current.phone ? undefined : 'page'}
          onClick={() => sheet.current?.showModal()}
          className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold text-cream-soft aria-[current=page]:font-bold aria-[current=page]:text-golden-light"
        >
          <Ellipsis aria-hidden className="size-5.5" />
          {m.admin_more()}
        </button>
      </nav>

      {/* The click handler only adds "click outside to close" for a pointer;
          keyboard users close the sheet with Escape or its close button */}
      {/* react-doctor-disable-next-line react-doctor/no-noninteractive-element-interactions */}
      <dialog
        ref={sheet}
        aria-label={m.admin_sections()}
        // A click on the backdrop lands on the dialog itself: close
        onClick={event => {
          if (event.target === event.currentTarget) sheet.current?.close();
        }}
        className="anim-reveal m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border-t border-line bg-club-green-dark p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-creme backdrop:bg-black/60 lg:hidden"
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            aria-label={m.nav_close_menu()}
            onClick={() => sheet.current?.close()}
            className="flex size-10 items-center justify-center rounded-xl bg-club-green-light"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <PaneNav pane={pane} onSelect={select} labelId={sheetNavId} />
        <div className="mt-6">
          <SessionControls {...sessionProps} />
        </div>
      </dialog>
    </div>
  );
}
