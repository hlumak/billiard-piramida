import { getLocale } from '../../paraglide/runtime.js';
import { venueMapEmbedUrl } from '../../lib/venue';
import { m } from '../../paraglide/messages.js';

/**
 * Google's embed of the club's own Maps listing — the only map that has the
 * club as a place, so the pin cannot drift onto a neighbour. Lazy, so a
 * visitor who never scrolls to it never fetches it.
 */
export function VenueMap({ className }: { className?: string }) {
  return (
    // The ring matters: light map tiles on the dark page read as a hole
    // punched in the layout without an edge to sit inside
    <div className={`overflow-hidden rounded-[20px] bg-card ring-1 ring-line ${className ?? ''}`}>
      <iframe
        src={venueMapEmbedUrl(getLocale())}
        title={m.map_label()}
        loading="lazy"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        // Scripts to draw the map, popups so its own links can open out
        // (escaping the sandbox, or the new tab would be opaque too).
        // Deliberately NO allow-same-origin: paired with allow-scripts a
        // frame can strip its own sandbox, and none of the embed's bundles
        // reach for storage, cookies or IndexedDB.
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        className="block size-full min-h-72 border-0"
      />
    </div>
  );
}
