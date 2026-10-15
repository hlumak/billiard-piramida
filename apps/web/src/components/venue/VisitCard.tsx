import { Clock, MapPin, Phone } from 'lucide-react';
import { VENUE } from '../../lib/venue';
import { m } from '../../paraglide/messages.js';
import { HoursList } from './HoursList';
import { VisitActions } from './VisitActions';

/**
 * Address, phone and opening hours with the two things a visitor does next:
 * get directions, or call. The home page's "find us" and the contacts page
 * both use it beside the map; the booking page has its own "how to get here"
 * that ends on the same actions.
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
      <VisitActions />
    </div>
  );
}
