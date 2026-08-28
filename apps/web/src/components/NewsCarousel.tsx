import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isExternalUrl, type NewsItemDto, type TournamentDto } from '@repo/shared';
import { newsQuery, tournamentsQuery } from '../lib/queries';
import { TournamentCardBody } from './TournamentCard';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

const AUTO_ADVANCE_MS = 6_000;

// Sits on the hero photo, so the panel needs enough body to keep copy readable
const CARD =
  'block h-full overflow-hidden rounded-[10px] bg-club-green/90 ring-1 ring-golden/25 backdrop-blur-sm';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function CardContent({ item }: { item: NewsItemDto }) {
  return (
    <>
      {item.imageUrl ? (
        // Decorative: the headline right below carries the same information
        <img src={item.imageUrl} alt="" loading="lazy" className="h-24 w-full object-cover" />
      ) : null}
      <div className="px-4 py-3">
        <p className="font-semibold text-golden">{item.title}</p>
        {item.body ? <p className="line-clamp-2 text-sm text-creme/85">{item.body}</p> : null}
      </div>
    </>
  );
}

/** Cards may link to an app route (client-side nav) or off-site; most link nowhere. */
function NewsCard({ item }: { item: NewsItemDto }) {
  if (item.linkUrl === null) {
    return (
      <div className={CARD}>
        <CardContent item={item} />
      </div>
    );
  }
  const interactive = `${CARD} transition-colors hover:ring-golden/60`;
  return isExternalUrl(item.linkUrl) ? (
    <a href={item.linkUrl} target="_blank" rel="noreferrer" className={interactive}>
      <CardContent item={item} />
    </a>
  ) : (
    <Link to={item.linkUrl} className={interactive}>
      <CardContent item={item} />
    </Link>
  );
}

/** Tournaments taking sign-ups lead the carousel — the card is the way in. */
function TournamentSlide({ tournament }: { tournament: TournamentDto }) {
  return (
    <Link
      to="/tournaments/$slug"
      params={{ slug: tournament.slug }}
      className={`${CARD} transition-colors hover:ring-golden/60`}
    >
      <TournamentCardBody tournament={tournament} />
    </Link>
  );
}

/**
 * Home-screen news, one card per view. The track is a scroll-snap container, so
 * swiping is the browser's own (no gesture library, no dependency): dots and
 * arrows just scroll it, and the active dot is read back from scroll position —
 * which keeps them honest during a swipe the JS never initiated.
 *
 * Open tournaments ride in front of the staff-authored cards: a sign-up that
 * closes on a date is the one thing here with a deadline.
 *
 * Renders nothing when there is nothing to show, and deliberately shows no
 * error state: a failed feed must not intrude on the first screen every
 * customer sees.
 */
export function NewsCarousel({ className }: { className?: string | undefined }) {
  const locale = getLocale();
  const { data: news } = useQuery(newsQuery(locale));
  const { data: tournaments } = useQuery(tournamentsQuery(locale));

  // Only tournaments still taking sign-ups earn a slot on the landing page;
  // finished and cancelled ones live on /tournaments.
  const slides = [
    ...(tournaments ?? []).flatMap(tournament =>
      tournament.registrationState === 'open'
        ? [
            {
              key: `tournament-${tournament.id}`,
              node: <TournamentSlide tournament={tournament} />
            }
          ]
        : []
    ),
    ...(news ?? []).map(item => ({ key: `news-${item.id}`, node: <NewsCard item={item} /> }))
  ];
  const count = slides.length;
  const trackRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  // Read by the auto-advance timer, which must not restart on every scroll tick
  const activeRef = useRef(0);
  const [paused, setPaused] = useState(false);

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    const card = track?.children[index];
    if (!track || !(card instanceof HTMLElement)) return;
    // Rect-based so gaps/padding and the current scroll offset all cancel out
    const left =
      card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
    track.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const scrollBy = (delta: number) => scrollToIndex((activeRef.current + delta + count) % count);

  // rAF-coalesced: a swipe fires dozens of scroll events and each pass measures
  const pendingFrame = useRef(0);
  const handleScroll = () => {
    if (pendingFrame.current !== 0) return;
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = 0;
      const track = trackRef.current;
      if (!track) return;
      const trackLeft = track.getBoundingClientRect().left;
      let nearest = 0;
      let shortest = Infinity;
      for (const [index, child] of [...track.children].entries()) {
        const distance = Math.abs(child.getBoundingClientRect().left - trackLeft);
        if (distance < shortest) {
          shortest = distance;
          nearest = index;
        }
      }
      activeRef.current = nearest;
      setActive(nearest);
    });
  };

  useEffect(() => () => cancelAnimationFrame(pendingFrame.current), []);

  useEffect(() => {
    if (count < 2 || paused || prefersReducedMotion()) return;
    const timer = window.setInterval(
      () => scrollToIndex((activeRef.current + 1) % count),
      AUTO_ADVANCE_MS
    );
    return () => window.clearInterval(timer);
  }, [count, paused, scrollToIndex]);

  if (count === 0) return null;

  // Beside the card, never over it: these are opaque, and a wide short card puts
  // its headline exactly where an inset arrow would land. The hero column is far
  // wider than the card, so the negative offsets stay inside the page padding.
  const arrow =
    'absolute top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-lg bg-club-green/80 text-golden backdrop-blur-sm hover:text-golden-hover md:flex';

  return (
    <section
      aria-roledescription="carousel"
      aria-label={m.news_title()}
      className={className}
      // Hover, touch (pointerenter/leave fire on tap too) and keyboard focus all
      // hold the rotation: nothing should slide away mid-read.
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative">
        <ul
          ref={trackRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, index) => (
            <li
              key={slide.key}
              aria-roledescription="slide"
              aria-label={m.news_position({ n: index + 1, total: count })}
              className="w-full shrink-0 snap-center"
            >
              {slide.node}
            </li>
          ))}
        </ul>

        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label={m.news_prev()}
              onClick={() => scrollBy(-1)}
              className={`${arrow} -left-11`}
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label={m.news_next()}
              onClick={() => scrollBy(1)}
              className={`${arrow} -right-11`}
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div role="group" aria-label={m.news_title()} className="mt-1 flex justify-center">
          {slides.map((slide, index) => (
            <button
              key={slide.key}
              type="button"
              aria-label={m.news_go_to({ n: index + 1 })}
              aria-current={index === active}
              onClick={() => scrollToIndex(index)}
              // Dots read as 6px but the tap target is a full 24px square
              className="flex size-6 items-center justify-center"
            >
              <span
                className={`h-1.5 rounded-full transition-all ${
                  index === active ? 'w-5 bg-golden' : 'w-1.5 bg-creme/40'
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
