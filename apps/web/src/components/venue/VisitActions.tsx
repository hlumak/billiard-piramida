import { Navigation, Phone } from 'lucide-react';
import { VENUE_DIRECTIONS_URL, VENUE_PHONE_HREF } from '../../lib/venue';
import { m } from '../../paraglide/messages.js';

/**
 * The two things a visitor does next once they know where the club is: get
 * directions, or call. Ends the visit card and the booking page's "how to get
 * here". Stacked, full width: side by side the directions label wrapped on a
 * narrow column and pushed its icon off to the edge.
 */
export function VisitActions({
  lift = false,
  className
}: {
  /** The booking page's directions button rises on hover; the visit card's stays put */
  lift?: boolean;
  className?: string;
}) {
  return (
    <div className={`mt-auto flex flex-col gap-2.5 ${className ?? ''}`}>
      <a
        href={VENUE_DIRECTIONS_URL}
        target="_blank"
        rel="noreferrer"
        className={`btn-gold ${lift ? 'lift ' : ''}h-12.5 whitespace-nowrap text-[15px]`}
      >
        <Navigation className="size-4.5" aria-hidden />
        {m.map_directions()}
      </a>
      <a href={VENUE_PHONE_HREF} className="btn-outline h-12.5 whitespace-nowrap text-[15px]">
        <Phone className="size-4.5" aria-hidden />
        {m.call_us()}
      </a>
    </div>
  );
}
