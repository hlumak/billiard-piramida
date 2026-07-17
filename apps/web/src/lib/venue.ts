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
