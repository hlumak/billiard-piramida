import { Link } from '@tanstack/react-router';
import { ChevronLeft, CircleUser, Menu } from 'lucide-react';
import { m } from '../paraglide/messages.js';

/** Transparent header over the hero photo: burger · brand · account. */
export function HomeHeader() {
  return (
    <header className="flex items-center justify-between">
      <Link to="/menu" aria-label={m.nav_menu()} className="text-golden hover:text-golden-hover">
        <Menu className="size-8" strokeWidth={2.5} />
      </Link>
      <span className="brand-title text-4xl leading-none md:text-5xl">piramida</span>
      <Link
        to="/bookings"
        aria-label={m.nav_my_bookings()}
        className="text-golden hover:text-golden-hover"
      >
        <CircleUser className="size-8" strokeWidth={2} />
      </Link>
    </header>
  );
}

/**
 * Inner-page header: back square · script title · account square.
 * Titles are Latin-only by design (Great Vibes), so they stay English in all locales.
 */
export function PageHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const backClasses =
    'flex size-8 items-center justify-center rounded-lg bg-club-green-light text-creme hover:bg-surface-hover';
  return (
    <header className="flex items-center justify-between">
      {onBack ? (
        <button type="button" aria-label={m.nav_back()} onClick={onBack} className={backClasses}>
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <Link to="/" aria-label={m.nav_back()} className={backClasses}>
          <ChevronLeft className="size-5" />
        </Link>
      )}
      <h1 className="page-title text-5xl leading-none md:text-6xl">{title}</h1>
      <Link
        to="/bookings"
        aria-label={m.nav_my_bookings()}
        className="flex size-8 items-center justify-center rounded-lg bg-creme text-club-green hover:bg-deep-cream"
      >
        <CircleUser className="size-5" strokeWidth={2} />
      </Link>
    </header>
  );
}
