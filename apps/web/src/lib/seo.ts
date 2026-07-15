import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { VENUE } from './venue';

/** Set VITE_SITE_URL to the real domain in production (og:image must be absolute). */
export const SITE_URL: string = import.meta.env.VITE_SITE_URL ?? 'http://localhost:8080';

const OG_LOCALES = { uk: 'uk_UA', pl: 'pl_PL', en: 'en_GB' } as const;

/** Standard head meta for an indexable page. */
export function pageMeta(title: string, description: string) {
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:locale', content: OG_LOCALES[getLocale()] }
  ];
}

/** Private/app pages: keep them out of search results. */
export function noindexMeta(title: string) {
  return [{ title }, { name: 'robots', content: 'noindex' }];
}

/** LocalBusiness structured data for the home page. */
export function venueJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'EntertainmentBusiness',
    name: VENUE.name,
    description: m.seo_desc_home(),
    url: SITE_URL,
    image: `${SITE_URL}/og-image.jpg`,
    telephone: VENUE.phone,
    priceRange: '40 PLN/h',
    address: {
      '@type': 'PostalAddress',
      streetAddress: VENUE.street,
      postalCode: VENUE.postalCode,
      addressLocality: VENUE.city,
      addressCountry: VENUE.country
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
        opens: '16:00',
        closes: '21:00'
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Friday',
        opens: '16:00',
        closes: '23:00'
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday', 'Sunday'],
        opens: '15:00',
        closes: '23:00'
      }
    ]
  });
}
