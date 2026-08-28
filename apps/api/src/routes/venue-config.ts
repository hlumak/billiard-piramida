import type { VenueConfigDto } from '@repo/shared';
import { VENUE_CONFIG_RESPONSE } from '../lib/schemas.ts';
import type { AppInstance } from '../app.ts';

/**
 * Rates and opening hours for the storefront. Public and cheap on purpose: the
 * prices page, the "open today" line and the structured data all need it, and
 * it is the same config the API validates bookings against, so the two can
 * never show a guest one thing and enforce another.
 */
export function venueConfigRoutes(app: AppInstance) {
  app.get(
    '/api/venue-config',
    { schema: { response: { 200: VENUE_CONFIG_RESPONSE } } },
    async (): Promise<VenueConfigDto> => app.venueConfig.get()
  );
}
