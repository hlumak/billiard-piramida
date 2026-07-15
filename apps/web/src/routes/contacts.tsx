import { createFileRoute } from '@tanstack/react-router';
import { MapPin, Phone } from 'lucide-react';
import { PageHeader } from '../components/AppHeader';
import { StaggerGroup, StaggerItem } from '../components/motion';
import { m } from '../paraglide/messages.js';
import { pageMeta } from '../lib/seo';
import { VENUE, VENUE_ADDRESS } from '../lib/venue';

export const Route = createFileRoute('/contacts')({
  head: () => ({ meta: pageMeta(m.seo_title_contacts(), m.seo_desc_contacts()) }),
  component: ContactsPage
});

function ContactsPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-3xl">
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
              className="flex items-center gap-3 rounded-[10px] bg-club-green-light p-4 transition-colors hover:bg-surface-hover"
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
            <dl className="flex flex-col gap-1 text-sm text-creme">
              <div className="flex justify-between">
                <dt className="text-grey-cool">{m.days_mon_thu()}</dt>
                <dd>16:00–21:00</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-grey-cool">{m.day_fri()}</dt>
                <dd>16:00–23:00</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-grey-cool">{m.days_sat_sun()}</dt>
                <dd>15:00–23:00</dd>
              </div>
            </dl>
          </StaggerItem>
        </StaggerGroup>
      </main>
    </div>
  );
}
