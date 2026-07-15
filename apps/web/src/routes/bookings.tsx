import { useEffect, useState } from 'react';
import { Spinner } from '@heroui/react';
import { useQueries } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { formatPln } from '@repo/shared';
import { PageHeader } from '../components/AppHeader';
import { PHASE_LABELS } from '../components/booking/phase';
import { StaggerGroup, StaggerItem } from '../components/motion';
import { formatDayLong, intlTag, warsawDate, warsawTime } from '../lib/format';
import { bookingQuery } from '../lib/queries';
import { recentBookingIds } from '../lib/recent-bookings';
import { m } from '../paraglide/messages.js';
import { noindexMeta } from '../lib/seo';

export const Route = createFileRoute('/bookings')({
  head: () => ({ meta: noindexMeta(m.seo_title_bookings()) }),
  component: MyBookingsPage
});

function MyBookingsPage() {
  // localStorage is browser-only; read after mount to stay SSR-safe
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => setIds(recentBookingIds()), []);

  const results = useQueries({
    queries: (ids ?? []).map(id => bookingQuery(id))
  });

  const isLoading = ids == null || results.some(result => result.isPending);
  const bookings = results.map(result => result.data).filter(booking => booking != null);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="bookings" />
      <main className="mt-8 flex-1">
        <h2 className="mb-4 text-xl font-semibold text-creme">{m.my_bookings_title()}</h2>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-grey-cool">{m.no_bookings()}</p>
            <Link to="/book" className="font-semibold text-golden">
              {m.menu_booking()}
            </Link>
          </div>
        ) : (
          <StaggerGroup>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {bookings.map(booking => (
                <StaggerItem key={booking.id}>
                  <li>
                    <Link
                      to="/booking/$id"
                      params={{ id: booking.id }}
                      className="block rounded-[10px] bg-club-green-light p-4 transition-colors hover:bg-surface-hover"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold capitalize text-creme">
                          {formatDayLong(warsawDate(booking.startsAt))}
                        </span>
                        <span className="text-xs font-semibold text-golden">
                          {PHASE_LABELS[booking.phase]()}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm text-grey-cool">
                        <span>
                          {warsawTime(booking.startsAt)}–{warsawTime(booking.endsAt)} ·{' '}
                          {m.table_n({ n: booking.tableId })}
                        </span>
                        <span className="font-semibold text-creme">
                          {formatPln(booking.totalGrosz, intlTag())}
                        </span>
                      </div>
                    </Link>
                  </li>
                </StaggerItem>
              ))}
            </ul>
          </StaggerGroup>
        )}
      </main>
    </div>
  );
}
