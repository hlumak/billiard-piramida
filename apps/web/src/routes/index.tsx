import { createFileRoute } from '@tanstack/react-router';
import { hoursForDate } from '@repo/shared';
import { HomeHeader } from '../components/AppHeader';
import { NewsCarousel } from '../components/NewsCarousel';
import { Reveal } from '../components/motion';
import { ButtonLink } from '../components/ButtonLink';
import { formatHour, warsawToday } from '../lib/format';
import { newsQuery, tournamentsQuery, venueConfigQuery } from '../lib/queries';
import { useVenueConfig } from '../lib/venue-config';
import { pageHead, venueJsonLd } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/')({
  // Carousel content is server data, so SSR it — but never let a feed outage
  // take the landing page down with it (the carousel hides itself instead).
  // allSettled, not all: one dead feed must not blank the other.
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(newsQuery(getLocale())),
      context.queryClient.ensureQueryData(tournamentsQuery(getLocale()))
    ]);
    // Warmed by the root loader; read back here so `head` can build the
    // structured data from the same rates and hours the page renders.
    return {
      venueConfig: context.queryClient.getQueryData(venueConfigQuery().queryKey) ?? null
    };
  },
  head: ({ match, loaderData }) => ({
    ...pageHead(m.app_title(), m.seo_desc_home(), match.pathname),
    scripts: [{ type: 'application/ld+json', children: venueJsonLd(loaderData?.venueConfig) }]
  }),
  component: Home
});

function Home() {
  const { open, close } = hoursForDate(warsawToday(), useVenueConfig().hours);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <picture>
        {/* Select by viewport width (device class), not resolution: high-DPR
            phones would otherwise pull the wide desktop crop via `w` descriptors. */}
        <source media="(min-width: 768px)" srcSet="/hero-bg-desktop.webp" />
        <img
          src="/hero-bg-mobile.webp"
          alt=""
          width={376}
          height={768}
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/10 to-black/50" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-[18dvh] pt-14 md:max-w-3xl md:pt-16">
        <Reveal>
          <HomeHeader />
        </Reveal>

        {/* Two `mt-auto` siblings split the free space: the news sits in the
            middle of the hero, the CTA stays pinned near the bottom. The
            carousel styles itself (rather than sitting in a wrapper) so that
            with no news it renders nothing at all and the CTA drops back down. */}
        <NewsCarousel className="anim-reveal mt-auto w-full self-center pt-8 [animation-delay:100ms] md:max-w-md" />

        <Reveal delay={0.15} className="mt-auto flex flex-col items-center gap-3">
          <div className="w-full max-w-74">
            <ButtonLink to="/book">{m.book_now()}</ButtonLink>
          </div>
          <p className="text-sm text-creme/80">
            {m.open_today({ open: formatHour(open), close: formatHour(close) })}
          </p>
        </Reveal>
      </div>
    </div>
  );
}
