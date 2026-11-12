import {
  addDays,
  SUPPORTED_LOCALES,
  VENUE_TIMEZONE,
  type IsoDate,
  type Locale,
  type NewsArticleDto,
  type TournamentDto,
  type VenueConfigDto
} from '@repo/shared';
import { m } from '../paraglide/messages.js';
import { baseLocale, getLocale, localizeHref } from '../paraglide/runtime.js';
import { formatDayLong, formatHour } from './format';
import { GOOGLE_LISTING_URL, VENUE } from './venue';
import { FALLBACK_VENUE_CONFIG, groupWeeklyHours } from './venue-config';

/** Set VITE_SITE_URL to the real domain in production (og:image must be absolute). */
export const SITE_URL: string = import.meta.env.VITE_SITE_URL ?? 'http://localhost:8080';

const OG_LOCALES = { uk: 'uk_UA', pl: 'pl_PL', en: 'en_GB' } as const;

/**
 * Site-relative address of a page in one language. `pathname` is the route's,
 * without a language prefix (the router strips it); index routes match with a
 * trailing slash ("/tournaments/") while links and the sitemap use the bare
 * form, and a canonical must pick one.
 */
export function localizedPath(pathname: string, locale: Locale): string {
  const bare = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return localizeHref(bare, { locale });
}

/** Absolute address of a page in one language (canonical, hreflang, og:url). */
export function localizedPageUrl(pathname: string, locale: Locale): string {
  return `${SITE_URL}${localizedPath(pathname, locale)}`;
}

/** What a phone's search result shows of a description before it cuts it (three lines). */
export const DESCRIPTION_MAX_CHARS = 120;

/**
 * A description that fits a phone's search result. Staff-written teasers have
 * no length limit, so a long one is cut at the last whole word and marked with
 * an ellipsis rather than being cut mid-word by the search engine; line breaks
 * and runs of spaces read as single spaces.
 */
export function clampDescription(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= DESCRIPTION_MAX_CHARS) return flat;
  const cut = flat.slice(0, DESCRIPTION_MAX_CHARS - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // A single huge word has no boundary to respect
  const words = lastSpace > DESCRIPTION_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut;
  return `${words.replace(/[\s,;:.!?—–-]+$/, '')}…`;
}

/**
 * Standard `head` for an indexable page: the canonical and og:url name this
 * language's address, and hreflang alternates point search engines at the
 * same page in the other two (x-default: Polish, the club's own language).
 */
export function pageHead(title: string, fullDescription: string, pathname: string, image?: string) {
  const locale = getLocale();
  const url = localizedPageUrl(pathname, locale);
  const description = clampDescription(fullDescription);
  // Unfurlers need an absolute image URL; app-relative covers (uploads included)
  // are same-origin with the site in production.
  const imageUrl =
    image === undefined ? undefined : image.startsWith('/') ? `${SITE_URL}${image}` : image;
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      // Per-page twins of the og:* set; the card type is global (__root), and so
      // is the image unless the page brings its own
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:url', content: url },
      ...(imageUrl === undefined
        ? []
        : [
            { property: 'og:image', content: imageUrl },
            { name: 'twitter:image', content: imageUrl }
          ])
    ],
    links: [
      { rel: 'canonical', href: url },
      ...SUPPORTED_LOCALES.map(other => ({
        rel: 'alternate',
        hrefLang: other,
        href: localizedPageUrl(pathname, other)
      })),
      { rel: 'alternate', hrefLang: 'x-default', href: localizedPageUrl(pathname, baseLocale) }
    ]
  };
}

/**
 * Private/app pages: keep them out of search results. No description or og
 * tags on purpose — these are not meant to be shared, and unfurlers fall back
 * to the <title> anyway, so the devtools SEO panel flagging them is expected.
 */
export function noindexMeta(title: string) {
  return [{ title }, { name: 'robots', content: 'noindex' }];
}

/**
 * Structured data as the text of a <script type="application/ld+json">. The
 * router writes that text into the page as it is, and JSON.stringify leaves
 * "<" alone — so a headline containing "</script>" closed the element and the
 * rest of it became markup on a public page. "<" as < is the same string
 * to a JSON parser and nothing at all to the HTML one.
 */
function jsonLd(data: unknown): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c');
}

/**
 * WebSite structured data for the home page: the name Google shows above the
 * result instead of the bare domain (its "site name"), with the alternates it
 * may fall back to.
 */
export function websiteJsonLd(): string {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: VENUE.name,
    alternateName: [m.app_title(), 'billiard-piramida.pl'],
    url: `${SITE_URL}/`
  });
}

/** schema.org day names, indexed by JS weekday (0 = Sunday). */
const SCHEMA_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const;

/**
 * LocalBusiness structured data for the home page. Rates and hours come from
 * the live config — the same numbers the page renders — so search results can
 * never advertise a price the club stopped charging. `config` is null only when
 * the fetch failed; the published defaults stand in.
 */
export function venueJsonLd(config: VenueConfigDto | null | undefined): string {
  const { rates: rateTable, hours } = config ?? FALLBACK_VENUE_CONFIG;
  const rates = Object.values(rateTable);
  // A late night's closing reads as the morning clock: 25 is "01:00"
  const pad = (hour: number) => `${String(hour > 24 ? hour - 24 : hour).padStart(2, '0')}:00`;

  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'EntertainmentBusiness',
    name: VENUE.name,
    description: m.seo_desc_home(),
    url: SITE_URL,
    image: `${SITE_URL}/og-image.jpg`,
    telephone: VENUE.phone,
    // Ties this site to the club's Google Maps listing (the same business)
    hasMap: GOOGLE_LISTING_URL,
    sameAs: [GOOGLE_LISTING_URL],
    // Spans every tier and is derived, so a rate change — or a new tier — can't
    // leave stale structured data behind
    priceRange: `${Math.min(...rates) / 100}–${Math.max(...rates) / 100} PLN/h`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: VENUE.street,
      postalCode: VENUE.postalCode,
      addressLocality: VENUE.city,
      addressCountry: VENUE.country
    },
    // A day the club is shut is simply omitted, which is how schema.org reads
    // an absent specification.
    openingHoursSpecification: groupWeeklyHours(hours).flatMap(group =>
      group.closed
        ? []
        : [
            {
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: group.weekdays.map(weekday => SCHEMA_DAYS[weekday]),
              opens: pad(group.hours.open),
              closes: pad(group.hours.close)
            }
          ]
    )
  });
}

/** The club as a schema.org Place: where a tournament is played. */
function venuePlace() {
  return {
    '@type': 'Place',
    name: `${VENUE.name}, ${VENUE.city}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: VENUE.street,
      postalCode: VENUE.postalCode,
      addressLocality: VENUE.city,
      addressCountry: VENUE.country
    }
  };
}

/** An image as an absolute URL: app-relative covers (uploads) are same-origin with the site. */
function absoluteImage(image: string | null): string {
  if (image === null) return `${SITE_URL}/og-image.jpg`;
  return image.startsWith('/') ? `${SITE_URL}${image}` : image;
}

/**
 * Article structured data for a news post: headline, date and cover, with the
 * club as author and publisher (staff write the posts, not named people).
 */
export function newsArticleJsonLd(article: NewsArticleDto, pageUrl: string): string {
  const club = { '@type': 'Organization', name: VENUE.name, url: `${SITE_URL}/` };
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    ...(article.body === null ? {} : { description: clampDescription(article.body) }),
    image: [absoluteImage(article.imageUrl)],
    datePublished: article.publishedAt,
    mainEntityOfPage: pageUrl,
    author: club,
    publisher: club
  });
}

/** Reads the club's UTC offset; built once, the time zone never changes. */
const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: VENUE_TIMEZONE,
  timeZoneName: 'longOffset'
});

/** Warsaw's UTC offset on a date, as "+01:00" / "+02:00". */
function warsawOffset(isoDate: IsoDate): string {
  const name = offsetFormat
    .formatToParts(new Date(`${isoDate}T12:00:00Z`))
    .find(part => part.type === 'timeZoneName')?.value;
  // "GMT+01:00"; a bare "GMT" would mean UTC itself
  return name === undefined || name === 'GMT' ? '+00:00' : name.slice(3);
}

/** When a tournament starts, for schema.org: a full local time, or just the date. */
function tournamentStart(t: TournamentDto): string | null {
  if (t.startsOn === null) return null;
  if (t.startHour === null) return t.startsOn;
  // The club's day runs past midnight: 25 is 01:00 the next morning
  const day = t.startHour >= 24 ? addDays(t.startsOn, 1) : t.startsOn;
  return `${day}T${formatHour(t.startHour)}:00${warsawOffset(day)}`;
}

/**
 * The search-result description of a tournament. Staff sometimes leave the
 * summary empty or repeat the title in it, which tells a searcher nothing, so
 * then it is built from the date and the place instead.
 */
export function tournamentDescription(t: TournamentDto): string {
  const summary = t.summary?.trim() ?? '';
  const sameAsTitle = summary.toLocaleLowerCase() === t.title.trim().toLocaleLowerCase();
  if (summary !== '' && !sameAsTitle) return summary;
  if (t.startsOn === null) return m.seo_desc_tournament_auto_undated({ title: t.title });
  const when = [formatDayLong(t.startsOn), t.startHour === null ? null : formatHour(t.startHour)]
    .filter(part => part !== null)
    .join(', ');
  return m.seo_desc_tournament_auto({ title: t.title, when });
}

const EVENT_STATUS: Partial<Record<TournamentDto['status'], string>> = {
  cancelled: 'https://schema.org/EventCancelled'
};

const OFFER_AVAILABILITY: Partial<Record<TournamentDto['registrationState'], string>> = {
  open: 'https://schema.org/InStock',
  full: 'https://schema.org/SoldOut'
};

/**
 * Event structured data for a tournament page, which makes it eligible for
 * Google's event results (date and place shown in search). A tournament with
 * no date yet has none: Google requires a start date.
 */
export function tournamentJsonLd(t: TournamentDto, pageUrl: string): string | null {
  const startDate = tournamentStart(t);
  if (startDate === null) return null;
  const availability = OFFER_AVAILABILITY[t.registrationState];
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: t.title,
    description: tournamentDescription(t),
    startDate,
    eventStatus: EVENT_STATUS[t.status] ?? 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: venuePlace(),
    image: [absoluteImage(t.imageUrl)],
    url: pageUrl,
    organizer: { '@type': 'Organization', name: VENUE.name, url: `${SITE_URL}/` },
    ...(t.maxPlayers === null ? {} : { maximumAttendeeCapacity: t.maxPlayers }),
    ...(t.entryFeeGrosz === null
      ? {}
      : {
          offers: {
            '@type': 'Offer',
            price: (t.entryFeeGrosz / 100).toFixed(2),
            priceCurrency: 'PLN',
            url: pageUrl,
            ...(availability === undefined ? {} : { availability }),
            // The deadline day is inclusive: sign-ups close at its end
            ...(t.registrationDeadline === null
              ? {}
              : {
                  validThrough: `${t.registrationDeadline}T23:59:59${warsawOffset(t.registrationDeadline)}`
                })
          }
        })
  });
}
