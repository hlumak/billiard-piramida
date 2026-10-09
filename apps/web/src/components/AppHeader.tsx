import { Link } from '@tanstack/react-router';
import { ChevronLeft, CircleUser, Menu } from 'lucide-react';
import { m } from '../paraglide/messages.js';
import { BrandLogo } from './BrandLogo';

/**
 * Transparent header over the hero photo: burger · brand · account. The brand
 * lockup is the home page's heading (its alt text is the club's name).
 */
export function HomeHeader() {
  return (
    <header className="flex items-center justify-between">
      <Link to="/menu" aria-label={m.nav_menu()} className="text-golden hover:text-golden-hover">
        <Menu className="size-8" strokeWidth={2.5} />
      </Link>
      <h1>
        <Link to="/">
          <BrandLogo className="w-36 md:w-44" />
        </Link>
      </h1>
      <Link
        to="/profile"
        aria-label={m.nav_profile()}
        className="text-golden hover:text-golden-hover"
      >
        <CircleUser className="size-8" strokeWidth={2} />
      </Link>
    </header>
  );
}

/**
 * Inner-page header: back square · script title · account square.
 * Titles are Latin-only by design (Great Vibes), so they stay English in all
 * locales — and are marked as English, so a Ukrainian or Polish voice does not
 * mispronounce them. A page with a heading of its own (a news article) passes
 * `decorative`: the script title then stays out of the outline, one h1 a page.
 */
export function PageHeader({
  title,
  onBack,
  decorative = false
}: {
  title: string;
  onBack?: () => void;
  decorative?: boolean;
}) {
  const Title = decorative ? 'p' : 'h1';
  const backClasses =
    'flex size-8 items-center justify-center rounded-lg bg-club-green-light text-creme hover:bg-surface-hover';
  return (
    <header className="flex items-center justify-between">
      {onBack ? (
        <button type="button" aria-label={m.nav_back()} onClick={onBack} className={backClasses}>
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <Link to="/" aria-label={m.nav_home()} className={backClasses}>
          <ChevronLeft className="size-5" />
        </Link>
      )}
      <Title
        lang="en"
        aria-hidden={decorative || undefined}
        className="page-title text-5xl leading-none md:text-6xl"
      >
        {title}
      </Title>
      <Link
        to="/profile"
        aria-label={m.nav_profile()}
        className="flex size-8 items-center justify-center rounded-lg bg-creme text-club-green hover:bg-deep-cream"
      >
        <CircleUser className="size-5" strokeWidth={2} />
      </Link>
    </header>
  );
}
