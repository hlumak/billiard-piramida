import type { Locale } from '@repo/shared';

/** Single source for real-world venue facts (contacts page, SEO, JSON-LD). */
export const VENUE = {
  name: 'piramida',
  /** The club is upstairs — guests who do not know that walk past the door. */
  street: 'ul. Tatrzańska 42/44, 1 piętro',
  postalCode: '93-219',
  city: 'Łódź',
  country: 'PL',
  phone: '+48 602 56 56 55'
} as const;

export const VENUE_ADDRESS = `${VENUE.street}, ${VENUE.postalCode} ${VENUE.city}`;

/**
 * Google's embed for the club's own Maps listing. The place id inside the `pb`
 * blob is "Klub Bilardowy Piramida" itself, which is the whole reason this
 * replaced a coordinate pin: the club is not a POI in OpenStreetMap, and
 * geocoding the street address lands on a neighbouring building.
 *
 * The blob is Google's own share payload, kept verbatim except for the two
 * language/region fields, which follow the site locale — every locale was
 * checked to return a shell carrying this same place id.
 *
 * Unlike the OSM embed this replaced, Google's does set third-party cookies
 * once it loads. That is the club's call, taken knowingly.
 */
const MAP_EMBED_PB =
  '!1m18!1m12!1m3!1d4940.42048659591!2d19.491529976840894!3d51.74747897186878' +
  '!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1' +
  '!3m3!1m2!1s0x471a35059efecc95%3A0x4175fac4554ad079!2sKlub%20Bilardowy%20Piramida!5e0';

export function venueMapEmbedUrl(locale: Locale): string {
  // Region stays pl — the venue's country, not the reader's
  const localeFields = `!1s${locale}!2spl`;
  return `https://www.google.com/maps/embed?pb=${MAP_EMBED_PB}!3m2${localeFields}!5m2${localeFields}`;
}

/**
 * Directions to the listing by name plus address rather than to a point: the
 * club is on the first floor, and Google routes to its own pin better than to
 * a coordinate we would have to keep in sync by hand.
 */
export const VENUE_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  `Klub Bilardowy Piramida, ${VENUE_ADDRESS}`
)}`;
