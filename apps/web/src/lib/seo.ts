import { SUPPORTED_LOCALES, type Locale, type VenueConfigDto } from '@repo/shared';
import { m } from '../paraglide/messages.js';
import { baseLocale, getLocale, localizeHref } from '../paraglide/runtime.js';
import { VENUE } from './venue';
import { FALLBACK_VENUE_CONFIG, groupWeeklyHours } from './venue-config';

/** Set VITE_SITE_URL to the real domain in production (og:image must be absolute). */
export const SITE_URL: string = import.meta.env.VITE_SITE_URL ?? 'http://localhost:8080';

const OG_LOCALES = { uk: 'uk_UA', pl: 'pl_PL', en: 'en_GB' } as const;

/**
 * Absolute address of a page in one language. `pathname` is the route's,
 * without a language prefix (the router strips it); index routes match with a
 * trailing slash ("/tournaments/") while links and the sitemap use the bare
 * form, and a canonical must pick one.
 */
export function localizedPageUrl(pathname: string, locale: Locale): string {
  const bare = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return `${SITE_URL}${localizeHref(bare, { locale })}`;
}

/**
 * Standard `head` for an indexable page: the canonical and og:url name this
 * language's address, and hreflang alternates point search engines at the
 * same page in the other two (x-default: Polish, the club's own language).
 */
export function pageHead(title: string, description: string, pathname: string, image?: string) {
  const locale = getLocale();
  const url = localizedPageUrl(pathname, locale);
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
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'EntertainmentBusiness',
    name: VENUE.name,
    description: m.seo_desc_home(),
    url: SITE_URL,
    image: `${SITE_URL}/og-image.jpg`,
    telephone: VENUE.phone,
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
