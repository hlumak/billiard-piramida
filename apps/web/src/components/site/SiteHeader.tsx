import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleUser, Menu, X } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { tournamentsQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { MenuContent } from './MenuContent';
import { NAV_LINKS } from './nav';

/**
 * The site header: logo, the sections, language, profile and the gold "book"
 * call to action. Below `lg` the sections fold into a burger that opens the
 * menu sheet — a real link to /menu, upgraded to a modal <dialog> once the page
 * is interactive, so it works before hydration and without JavaScript.
 *
 * `overlay` sits it on the home hero photo: transparent, with the icon buttons
 * on a dark glass so they stay legible over the picture.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const sheet = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // The badge on "Tournaments" is only worth a request once the sheet is open
  const { data: tournaments } = useQuery({ ...tournamentsQuery(getLocale()), enabled: open });
  const tournamentsOpen = tournaments?.some(t => t.registrationState === 'open') ?? false;

  const openSheet = (event: MouseEvent) => {
    if (sheet.current === null) return;
    event.preventDefault();
    sheet.current.showModal();
    setOpen(true);
  };
  const closeSheet = () => sheet.current?.close();

  // Any navigation (a link in the sheet, the browser's back button) closes it,
  // so the next page is never left locked under an open sheet
  const router = useRouter();
  useEffect(() => router.subscribe('onBeforeNavigate', () => sheet.current?.close()), [router]);

  const iconButton = `flex size-11 items-center justify-center rounded-xl transition-colors ${
    overlay
      ? 'border border-creme/20 bg-club-green-deepest/55 hover:bg-club-green-deepest/80'
      : 'bg-club-green-light hover:bg-surface-hover'
  }`;

  return (
    <header className={overlay ? 'relative z-10' : 'border-b border-line'}>
      <div className="mx-auto flex h-19 w-full max-w-[1240px] items-center gap-6 px-5 md:px-10 lg:h-24 lg:gap-10">
        <Link to="/" aria-label={m.nav_home()} className="shrink-0">
          <BrandLogo priority={overlay} className="h-[42px] w-auto lg:h-[50px]" />
        </Link>

        <nav aria-label={m.nav_main()} className="hidden flex-1 gap-8 lg:flex">
          {NAV_LINKS.map(link => (
            <Link key={link.to} to={link.to} className="nav-link text-[15px] font-semibold">
              {link.label()}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:gap-3">
          <LocaleSwitcher className="hidden xl:inline-flex" />
          <Link to="/profile" aria-label={m.nav_profile()} className={iconButton}>
            <CircleUser className="size-[22px]" aria-hidden />
          </Link>
          {pathname === '/book' ? null : (
            <Link to="/book" className="btn-gold hidden h-11 px-5 text-[15px] lg:inline-flex">
              {m.book_now()}
            </Link>
          )}
          <Link
            to="/menu"
            onClick={openSheet}
            aria-label={m.nav_menu()}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={`${iconButton} text-golden lg:hidden`}
          >
            <Menu className="size-[22px]" strokeWidth={2.4} aria-hidden />
          </Link>
        </div>
      </div>

      {/* Full screen on a phone, a side sheet from the right on a tablet. A
          click on the backdrop (the dialog element itself) closes it. */}
      <dialog
        ref={sheet}
        aria-label={m.nav_menu()}
        onClose={() => setOpen(false)}
        onClick={event => {
          if (event.target === event.currentTarget) closeSheet();
        }}
        className="menu-sheet fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 bg-club-green-dark p-0 text-creme backdrop:bg-black/55 sm:max-w-[420px]"
      >
        {open ? (
          <MenuContent
            onNavigate={closeSheet}
            tournamentsOpen={tournamentsOpen}
            closeControl={
              <button
                type="button"
                autoFocus
                onClick={closeSheet}
                aria-label={m.nav_close_menu()}
                className="flex size-11 items-center justify-center rounded-xl bg-club-green-light text-creme transition-colors hover:bg-surface-hover"
              >
                <X className="size-[22px]" strokeWidth={2.4} aria-hidden />
              </button>
            }
          />
        ) : null}
      </dialog>
    </header>
  );
}
