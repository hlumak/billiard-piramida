import type { VenueConfigDto } from '@repo/shared';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { VENUE } from './venue';
import { FALLBACK_VENUE_CONFIG, groupWeeklyHours } from './venue-config';

/** Set VITE_SITE_URL to the real domain in production (og:image must be absolute). */
export const SITE_URL: string = import.meta.env.VITE_SITE_URL ?? 'http://localhost:8080';

const OG_LOCALES = { uk: 'uk_UA', pl: 'pl_PL', en: 'en_GB' } as const;

/**
 * Standard `head` for an indexable page. `pathname` is the route match's, so
 * the canonical and the og:url agree with each other and with the sitemap
 * (locale is a cookie, not a URL segment, so one canonical serves all three).
 */
export function pageHead(title: string, description: string, pathname: string) {
  // Index routes match with a trailing slash ("/tournaments/"); the sitemap and
  // every internal link use the bare form, and a canonical must pick one.
  const url = `${SITE_URL}${pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname}`;
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:locale', content: OG_LOCALES[getLocale()] },
      // Per-page twins of the og:* set; the card type and image are global (__root)
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:url', content: url }
    ],
    links: [{ rel: 'canonical', href: url }]
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
