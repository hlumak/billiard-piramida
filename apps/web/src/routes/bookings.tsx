import { useEffect, useState } from 'react';
import { Button, FieldError, Input, Label, Spinner, TextField } from '@heroui/react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { formatPln } from '@repo/shared';
import { isValidPhone } from '@repo/shared/phone';
import { PageHeader } from '../components/AppHeader';
import { PHASE_LABELS } from '../components/booking/phase';
import { StaggerGroup, StaggerItem } from '../components/motion';
import { formatDayLong, intlTag, warsawDate, warsawTime } from '../lib/format';
import { bookingQuery } from '../lib/queries';
import { ApiError, api } from '../lib/api';
import { QueryError } from '../components/QueryError';
import { recentBookingIds, rememberBooking } from '../lib/recent-bookings';
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
  // A 404 means that stored booking is gone (drop it silently); a network/5xx
  // failure with nothing to show must not masquerade as "no bookings".
  const hardFailure = results.some(
    result => result.error && !(result.error instanceof ApiError && result.error.status === 404)
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="bookings" />
      <main className="mt-8 flex-1">
        <h2 className="mb-4 text-xl font-semibold text-creme">{m.my_bookings_title()}</h2>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : hardFailure && bookings.length === 0 ? (
          <QueryError onRetry={() => results.forEach(result => void result.refetch())} />
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

        <LookupSection onFound={() => setIds(recentBookingIds())} />
      </main>
    </div>
  );
}

/** Recover bookings made on another device/browser by the phone used to book. */
function LookupSection({ onFound }: { onFound: () => void }) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: (value: string) => api.lookupBookings(value),
    onSuccess: found => {
      for (const booking of found) {
        rememberBooking(booking.id);
        // Seed the per-booking cache so the list above renders without refetching
        queryClient.setQueryData(bookingQuery(booking.id).queryKey, booking);
      }
      if (found.length > 0) onFound();
    }
  });

  const statusMessage = lookup.isError
    ? m.err_generic()
    : lookup.data?.length === 0
      ? m.find_booking_none()
      : null;

  return (
    <section className="mt-12 flex flex-col items-center text-center">
      <h2 className="mb-2 text-xl font-semibold text-creme">{m.find_booking_title()}</h2>
      <p className="mb-4 text-sm text-grey-cool">{m.find_booking_hint()}</p>
      <form
        className="flex w-full flex-col gap-3 text-left md:max-w-sm"
        onSubmit={event => {
          event.preventDefault();
          if (!isValidPhone(phone)) {
            setPhoneError(m.err_phone_invalid());
            return;
          }
          lookup.mutate(phone.trim());
        }}
      >
        <TextField
          name="phone"
          type="tel"
          value={phone}
          onChange={value => {
            setPhone(value);
            // A stuck isInvalid blocks native resubmission — clear on change
            setPhoneError(null);
            lookup.reset();
          }}
          isInvalid={phoneError != null}
        >
          <Label>{m.phone_label()}</Label>
          <Input placeholder={m.phone_placeholder()} />
          <FieldError>{phoneError}</FieldError>
        </TextField>
        {statusMessage ? <p className="text-sm text-grey-cool">{statusMessage}</p> : null}
        <Button
          type="submit"
          size="lg"
          className="h-[45px] w-full text-lg font-bold"
          isPending={lookup.isPending}
        >
          {m.btn_find()}
        </Button>
      </form>
    </section>
  );
}
