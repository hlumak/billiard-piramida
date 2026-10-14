import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { VENUE, VENUE_DIRECTIONS_URL } from '../../lib/venue';
import { m } from '../../paraglide/messages.js';
import { HoursList } from './HoursList';

/**
 * Address, phone and opening hours with the two things a visitor does next:
 * get directions, or call. The home page's "find us" and the booking
 * confirmation both use it beside the map.
 */
export function VisitCard({ className }: { className?: string }) {
  return (
    <div className={`card flex flex-col gap-5.5 p-6 md:p-7.5 ${className ?? ''}`}>
      <div className="flex gap-3.5">
        <MapPin className="mt-0.5 size-5.5 shrink-0 text-golden" aria-hidden />
        <div>
          <p className="text-[13px] text-grey-cool">{m.address_label()}</p>
          <p className="mt-1 text-[17px] font-semibold leading-snug">
            {VENUE.street}, {VENUE.postalCode} {VENUE.city}
          </p>
        </div>
      </div>
      <div className="flex gap-3.5">
        <Phone className="mt-0.5 size-5.5 shrink-0 text-golden" aria-hidden />
        <div>
          <p className="text-[13px] text-grey-cool">{m.phone_contact_label()}</p>
          <p className="mt-1 text-[17px] font-semibold">{VENUE.phone}</p>
        </div>
      </div>
      <div className="flex gap-3.5">
        <Clock className="mt-0.5 size-5.5 shrink-0 text-golden" aria-hidden />
        <div className="flex-1">
          <p className="text-[13px] text-grey-cool">{m.opening_hours()}</p>
          <HoursList className="mt-2" />
        </div>
      </div>
      {/* Stacked, full width: side by side the directions label wrapped on a
          narrow column and pushed its icon off to the edge */}
      <div className="mt-auto flex flex-col gap-2.5">
        <a
          href={VENUE_DIRECTIONS_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-gold h-12.5 whitespace-nowrap text-[15px]"
        >
          <Navigation className="size-4.5" aria-hidden />
          {m.map_directions()}
        </a>
        <a
          href={`tel:${VENUE.phone.replaceAll(' ', '')}`}
          className="btn-outline h-12.5 whitespace-nowrap text-[15px]"
        >
          <Phone className="size-4.5" aria-hidden />
          {m.call_us()}
        </a>
      </div>
    </div>
  );
}
