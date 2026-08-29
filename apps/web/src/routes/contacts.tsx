import { createFileRoute } from '@tanstack/react-router';
import { MapPin, Navigation, Phone } from 'lucide-react';
import { PageHeader } from '../components/AppHeader';
import { StaggerGroup, StaggerItem } from '../components/motion';
import { m } from '../paraglide/messages.js';
import { pageMeta } from '../lib/seo';
import { VENUE, VENUE_ADDRESS, VENUE_DIRECTIONS_URL, VENUE_MAP_EMBED_URL } from '../lib/venue';
import { formatHour, weekdayName } from '../lib/format';
import { groupWeeklyHours, useVenueConfig } from '../lib/venue-config';

export const Route = createFileRoute('/contacts')({
  head: () => ({ meta: pageMeta(m.seo_title_contacts(), m.seo_desc_contacts()) }),
  component: ContactsPage
});

/** "понеділок" for one day, "понеділок–четвер" for a run. */
function dayRangeLabel(weekdays: number[]): string {
  const first = weekdays[0];
  const last = weekdays.at(-1);
  if (first === undefined || last === undefined) return '';
  return first === last ? weekdayName(first) : `${weekdayName(first)}–${weekdayName(last)}`;
}

function ContactsPage() {
  const { hours } = useVenueConfig();

  return (
    // Three cards side by side need more room than the one-column pages: at
    // md:max-w-3xl every card was narrow enough to break the address and the
    // opening times onto a second line. Widening matches /admin's lg step.
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-3xl lg:max-w-5xl">
      <PageHeader title="contacts" />
      <main className="mt-8 flex-1">
        <StaggerGroup className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
          <StaggerItem className="flex items-center gap-3 rounded-[10px] bg-club-green-light p-4">
            <MapPin className="size-6 shrink-0 text-golden" />
            <div>
              <p className="text-xs text-grey-cool">{m.address_label()}</p>
              <p className="font-medium text-creme">{VENUE_ADDRESS}</p>
            </div>
          </StaggerItem>

          <StaggerItem>
            <a
              href={`tel:${VENUE.phone.replaceAll(' ', '')}`}
              className="flex h-full items-center gap-3 rounded-[10px] bg-club-green-light p-4 transition-colors hover:bg-surface-hover"
            >
              <Phone className="size-6 shrink-0 text-golden" />
              <div>
                <p className="text-xs text-grey-cool">{m.phone_contact_label()}</p>
                <p className="font-medium text-creme">{VENUE.phone}</p>
              </div>
            </a>
          </StaggerItem>

          <StaggerItem className="rounded-[10px] bg-club-green-light p-4">
            <p className="mb-2 font-semibold text-golden">{m.opening_hours()}</p>
            {/* Rows come from the live config, so an owner who moves a closing
                time does not leave this card advertising the old one. Adjacent
                days with matching hours collapse into one range. */}
            <dl className="flex flex-col gap-1 text-sm text-creme">
              {groupWeeklyHours(hours).map(group => (
                <div key={group.weekdays.join('-')} className="flex justify-between gap-3">
                  <dt className="capitalize text-grey-cool">{dayRangeLabel(group.weekdays)}</dt>
                  {/* A time range that wraps mid-dash reads as two times */}
                  <dd className="whitespace-nowrap">
                    {group.closed
                      ? m.hours_closed()
                      : `${formatHour(group.hours.open)}–${formatHour(group.hours.close)}`}
                  </dd>
                </div>
              ))}
            </dl>
          </StaggerItem>

          {/* Spans the row under the three cards, where the page used to run out
              of content. OpenStreetMap's embed rather than Google's: no API key,
              no third-party cookies on load. Lazy so the tiles are not fetched
              for a visitor who only wanted the phone number. */}
          <StaggerItem className="md:col-span-3">
            {/* The ring matters here: light map tiles on the dark page read as a
                hole punched in the layout without an edge to sit inside. */}
            <div className="overflow-hidden rounded-[10px] bg-club-green-light ring-1 ring-creme/10">
              <iframe
                src={VENUE_MAP_EMBED_URL}
                title={m.map_label()}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                // Scripts because the map is Leaflet, popups so its own links
                // can open out (escaping the sandbox, or the new tab would be
                // opaque too). Deliberately NO allow-same-origin: paired with
                // allow-scripts a frame can strip its own sandbox, and this
                // embed needs no origin of its own — its bundle touches no
                // storage, no cookies, no IndexedDB, and loads tiles as plain
                // images. Top-level navigation, forms and downloads stay blocked.
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                className="h-64 w-full border-0 md:h-80"
              />
              <a
                href={VENUE_DIRECTIONS_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 p-4 font-medium text-golden transition-colors hover:bg-surface-hover hover:text-golden-hover"
              >
                <Navigation className="size-4 shrink-0" />
                {m.map_directions()}
              </a>
            </div>
          </StaggerItem>
        </StaggerGroup>
      </main>
    </div>
  );
}
