import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Star } from 'lucide-react';
import { hoursForDate, isClosedAllDay, type TournamentDto } from '@repo/shared';
import { FreeTables } from '../components/home/FreeTables';
import { TournamentSpotlight } from '../components/home/TournamentSpotlight';
import { NewsListItem } from '../components/NewsListItem';
import { RateTiles } from '../components/RateTiles';
import { BackToTop } from '../components/site/BackToTop';
import { SectionTitle } from '../components/site/PageTitle';
import { SiteFooter } from '../components/site/SiteFooter';
import { SiteHeader } from '../components/site/SiteHeader';
import { SportCardsBand } from '../components/SportCardsBand';
import { VenueMap } from '../components/venue/VenueMap';
import { VisitCard } from '../components/venue/VisitCard';
import { formatHour, formatNumber, warsawToday } from '../lib/format';
import { newsQuery, tournamentsQuery, venueConfigQuery } from '../lib/queries';
import { pageHead, venueJsonLd, websiteJsonLd } from '../lib/seo';
import { GOOGLE_LISTING_URL, GOOGLE_RATING } from '../lib/venue';
import { useVenueConfig } from '../lib/venue-config';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/')({
  // News and tournaments are server data, so SSR them — but never let a feed
  // outage take the landing page down (each section hides itself instead).
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
    ...pageHead(m.seo_title_home(), m.seo_desc_home(), match.pathname),
    scripts: [
      { type: 'application/ld+json', children: venueJsonLd(loaderData?.venueConfig) },
      { type: 'application/ld+json', children: websiteJsonLd() }
    ]
  }),
  component: Home
});

/** The open tournament that starts first; undated ones after the dated. */
function nextOpenTournament(tournaments: TournamentDto[] | undefined): TournamentDto | null {
  const open = (tournaments ?? []).filter(t => t.registrationState === 'open');
  open.sort((a, b) => (a.startsOn ?? '9999').localeCompare(b.startsOn ?? '9999'));
  return open[0] ?? null;
}

function Pills() {
  const today = hoursForDate(warsawToday(), useVenueConfig().hours);
  const score = formatNumber(GOOGLE_RATING.score, { minimumFractionDigits: 1 });
  const pill =
    'inline-flex items-center gap-2 rounded-full border border-creme/20 bg-club-green-deepest/65 px-3 py-1.5 text-xs font-medium lg:gap-2.5 lg:px-4 lg:py-2 lg:text-sm';
  return (
    <div className="flex flex-wrap gap-2 lg:gap-2.5">
      <p className={pill}>
        <span aria-hidden className="size-2 rounded-full bg-golden" />
        {isClosedAllDay(today)
          ? m.closed_today()
          : m.open_today({ open: formatHour(today.open), close: formatHour(today.close) })}
      </p>
      <a
        href={GOOGLE_LISTING_URL}
        target="_blank"
        rel="noreferrer"
        className={`${pill} text-creme transition-colors hover:border-golden/60`}
      >
        <Star className="size-3.5 fill-golden text-golden lg:size-4" aria-hidden />
        <strong className="font-bold">{score}</strong>
        <span>· {m.home_reviews({ n: GOOGLE_RATING.count })}</span>
      </a>
    </div>
  );
}

function Home() {
  const locale = getLocale();
  const { data: news } = useQuery(newsQuery(locale));
  const { data: tournaments } = useQuery(tournamentsQuery(locale));
  const spotlight = nextOpenTournament(tournaments);
  const latestNews = (news ?? []).slice(0, 2);

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* The photo spans the header and the hero; the gradient darkens the top
          for the header and melts the bottom into the page colour */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[660px] overflow-hidden lg:h-[920px]">
        <picture>
          {/* By viewport width (device class), not resolution: high-DPR phones
              would otherwise pull the wide desktop crop */}
          <source media="(min-width: 768px)" srcSet="/hero-bg-desktop.webp" />
          <img
            src="/hero-bg-mobile.webp"
            alt=""
            width={376}
            height={768}
            fetchPriority="high"
            className="anim-hero-photo size-full object-cover"
          />
        </picture>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(4_22_14/0.86)_0%,rgb(4_22_14/0.3)_26%,rgb(4_22_14/0.58)_58%,var(--color-club-green)_100%)]" />
      </div>

      <SiteHeader overlay />

      <main id="main" className="relative flex-1">
        <section className="mx-auto w-full max-w-[1240px] px-5 md:px-10 lg:flex lg:min-h-[824px] lg:flex-col">
          <div
            className={`grid lg:items-center lg:gap-16 lg:pt-20 ${spotlight ? 'lg:grid-cols-[minmax(0,1fr)_440px]' : ''}`}
          >
            <div className="anim-reveal flex min-h-[584px] flex-col justify-end pb-7 lg:min-h-0 lg:pb-0">
              <Pills />
              <h1 className="mt-4 max-w-[600px] text-[38px] leading-[1.06] font-bold tracking-[-0.01em] lg:mt-6.5 lg:text-[64px] lg:leading-[1.04] lg:tracking-[-0.015em]">
                {m.home_title()}
              </h1>
              <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-cream-soft lg:mt-5.5 lg:text-[19px]">
                {m.home_lead()}
              </p>
              <div className="mt-5 flex gap-3.5 lg:mt-9">
                <Link
                  to="/book"
                  className="btn-gold group h-14 flex-1 px-7.5 text-[17px] sm:flex-none lg:h-14.5"
                >
                  {m.home_cta_book()}
                  <ArrowRight
                    className="size-5 transition-transform group-hover:translate-x-1"
                    strokeWidth={2.4}
                    aria-hidden
                  />
                </Link>
                <Link
                  to="/prices"
                  className="btn-outline hidden h-14.5 bg-club-green-deepest/40 px-7 text-[17px] sm:inline-flex"
                >
                  {m.home_cta_prices()}
                </Link>
              </div>
            </div>
            {spotlight ? (
              <TournamentSpotlight tournament={spotlight} className="[animation-delay:0.4s]" />
            ) : null}
          </div>
          <FreeTables className="anim-reveal mt-3.5 [animation-delay:0.55s] lg:mt-auto lg:mb-12" />
        </section>

        {latestNews.length > 0 ? (
          // Changing news, not what the club is: kept out of search snippets
          <section
            data-nosnippet=""
            aria-labelledby="home-news"
            className="mx-auto w-full max-w-[1240px] px-5 pt-15 md:px-10 lg:pt-22"
          >
            <div className="flex items-end justify-between gap-6">
              <SectionTitle script="news" title={m.news_title()} id="home-news" />
              <Link
                to="/news"
                className="text-sm font-semibold text-golden-light transition-colors hover:text-golden md:text-[15px]"
              >
                {m.news_all()} →
              </Link>
            </div>
            <ul className="-mx-5 mt-5 flex snap-x gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:mt-9 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0">
              {latestNews.map(item => (
                <li
                  key={item.id}
                  className="anim-stagger-item w-[300px] shrink-0 snap-start md:w-auto"
                >
                  <NewsListItem item={item} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          aria-labelledby="home-prices"
          className="mx-auto w-full max-w-[1240px] px-5 pt-15 md:px-10 lg:pt-28"
        >
          <div className="flex items-end justify-between gap-6">
            <SectionTitle script="prices" title={m.home_prices_title()} id="home-prices" />
            <Link
              to="/prices"
              className="hidden text-[15px] font-semibold text-golden-light transition-colors hover:text-golden md:block"
            >
              {m.home_all_prices()} →
            </Link>
          </div>
          <div className="mt-5.5 md:mt-9">
            <RateTiles />
          </div>
          <SportCardsBand />
          <p className="mt-4 text-sm text-grey-cool">{m.min_booking_note()}</p>
          <Link
            to="/prices"
            className="mt-4 inline-block text-[15px] font-bold text-golden-light md:hidden"
          >
            {m.home_all_prices()} →
          </Link>
        </section>

        <section
          aria-labelledby="home-find-us"
          className="mx-auto w-full max-w-[1240px] px-5 pt-15 md:px-10 lg:pt-28"
        >
          <SectionTitle script="find us" title={m.home_find_us()} id="home-find-us" />
          <div className="mt-5.5 grid gap-6 md:mt-9 lg:grid-cols-[5fr_7fr]">
            <VisitCard />
            <VenueMap className="hidden lg:block" />
          </div>
        </section>
      </main>

      <SiteFooter variant="full" />
      <BackToTop />
    </div>
  );
}
