import { m } from '../../paraglide/messages.js';

/**
 * Every page the site's navigation links to, with the name it goes by there.
 * Each place below picks its own selection and order from these, so a section
 * is named the same way in the header, the menu sheet and the footer.
 */
const LINK = {
  book: { to: '/book', label: () => m.menu_booking() },
  bookings: { to: '/bookings', label: () => m.nav_my_bookings() },
  tournaments: { to: '/tournaments', label: () => m.menu_tournaments() },
  news: { to: '/news', label: () => m.menu_news() },
  prices: { to: '/prices', label: () => m.menu_prices() },
  contacts: { to: '/contacts', label: () => m.nav_contacts() },
  profile: { to: '/profile', label: () => m.nav_profile() }
} as const;

/**
 * The header's sections. Booking is not here: it is the gold call to action
 * everywhere; nor is the profile, an icon button beside it.
 */
export const NAV_LINKS = [
  LINK.tournaments,
  LINK.news,
  LINK.prices,
  LINK.contacts,
  LINK.bookings
] as const;

/** The menu sheet's own order: the visitor's bookings first, the profile last. */
export const MENU_LINKS = [
  LINK.bookings,
  LINK.tournaments,
  LINK.news,
  LINK.prices,
  LINK.contacts,
  LINK.profile
] as const;

/** The full footer's two columns: what a player books, and what the club runs. */
export const FOOTER_PLAYER_LINKS = [LINK.book, LINK.bookings, LINK.prices] as const;
export const FOOTER_CLUB_LINKS = [LINK.tournaments, LINK.news, LINK.contacts] as const;
