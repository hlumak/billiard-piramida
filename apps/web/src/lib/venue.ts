/** Single source for real-world venue facts (contacts page, SEO, JSON-LD). */
export const VENUE = {
  name: 'piramida',
  street: 'ul. Zielona 12',
  postalCode: '00-001',
  city: 'Warszawa',
  country: 'PL',
  phone: '+48 123 456 789'
} as const;

export const VENUE_ADDRESS = `${VENUE.street}, ${VENUE.postalCode} ${VENUE.city}`;
