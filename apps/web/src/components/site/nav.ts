import { m } from '../../paraglide/messages.js';

/**
 * The site's sections, in the order the header, the menu sheet and the footer
 * list them. Booking is not here: it is the gold call to action everywhere.
 */
export const NAV_LINKS = [
  { to: '/tournaments', label: () => m.menu_tournaments() },
  { to: '/news', label: () => m.menu_news() },
  { to: '/prices', label: () => m.menu_prices() },
  { to: '/contacts', label: () => m.nav_contacts() },
  { to: '/bookings', label: () => m.nav_my_bookings() }
] as const;
