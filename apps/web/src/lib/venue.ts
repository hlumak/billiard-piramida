/** Single source for real-world venue facts (contacts page, SEO, JSON-LD). */
export const VENUE = {
  name: 'piramida',
  street: 'ul. Tatrzańska 42/44',
  postalCode: '93-219',
  city: 'Łódź',
  country: 'PL',
  phone: '+48 602 56 56 55'
} as const;

export const VENUE_ADDRESS = `${VENUE.street}, ${VENUE.postalCode} ${VENUE.city}`;

/** The building itself, geocoded from the address against OpenStreetMap. */
const VENUE_LAT = 51.747_717;
const VENUE_LON = 19.494_798;

// Roughly 500 m across, 270 m tall: enough of the surrounding streets to place
// the club, close enough to still read the house numbers.
const MAP_SPAN_LON = 0.0035;
const MAP_SPAN_LAT = 0.0012;

/**
 * OpenStreetMap's own embed, deliberately not Google's: it needs no API key and
 * sets no third-party cookies, so the contacts page stays free of consent
 * machinery the rest of the site does not have. Directions still hand off to
 * Google — but only once the visitor clicks.
 */
export const VENUE_MAP_EMBED_URL =
  'https://www.openstreetmap.org/export/embed.html?' +
  new URLSearchParams({
    bbox: [
      VENUE_LON - MAP_SPAN_LON,
      VENUE_LAT - MAP_SPAN_LAT,
      VENUE_LON + MAP_SPAN_LON,
      VENUE_LAT + MAP_SPAN_LAT
    ].join(','),
    layer: 'mapnik',
    marker: `${VENUE_LAT},${VENUE_LON}`
  }).toString();

export const VENUE_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${VENUE_LAT},${VENUE_LON}`;
