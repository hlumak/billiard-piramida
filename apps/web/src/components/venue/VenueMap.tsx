import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { getLocale } from '../../paraglide/runtime.js';
import { venueMapEmbedUrl } from '../../lib/venue';
import { m } from '../../paraglide/messages.js';

/**
 * Google's embed of the club's own Maps listing — the only map that has the
 * club as a place, so the pin cannot drift onto a neighbour. Nothing is
 * fetched from Google until the visitor taps "Show map": a click-to-load
 * frame needs no consent banner, and a visitor who never wants the map never
 * talks to Google at all.
 */
// Mounted only by the tap, so focus follows the map instead of falling back
// to the page when the button disappears. Module-level so a re-render does
// not hand React a new callback, which would focus the frame again.
const focusOnMount = (node: HTMLIFrameElement | null) => node?.focus();

export function VenueMap({ className }: { className?: string }) {
  const [shown, setShown] = useState(false);

  return (
    // The ring matters: light map tiles on the dark page read as a hole
    // punched in the layout without an edge to sit inside
    <div className={`overflow-hidden rounded-[20px] bg-card ring-1 ring-line ${className ?? ''}`}>
      {shown ? (
        <iframe
          ref={focusOnMount}
          src={venueMapEmbedUrl(getLocale())}
          title={m.map_label()}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          // Scripts to draw the map, popups so its own links can open out
          // (escaping the sandbox, or the new tab would be opaque too).
          // Deliberately NO allow-same-origin: the frame runs with an empty
          // ("null") origin, so Google's scripts get no cookies or storage of
          // their own here. The price is console noise from inside the frame —
          // a few of its background calls fail CORS from origin "null" — while
          // the map, the pin and the place card still draw.
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          className="block size-full min-h-72 border-0"
        />
      ) : (
        <div className="flex size-full min-h-72 flex-col items-center justify-center gap-4 p-6 text-center">
          {/* No address here: every page that shows the map has it right beside */}
          <MapPin className="size-8 text-golden" aria-hidden />
          <button
            type="button"
            onClick={() => setShown(true)}
            className="btn-outline h-11 px-5 text-[15px]"
          >
            {m.map_show()}
          </button>
          <p className="max-w-72 text-[12px] leading-snug text-grey-cool">{m.map_show_note()}</p>
        </div>
      )}
    </div>
  );
}
