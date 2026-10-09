import { useEffect, useState } from 'react';
import { Button, FieldError, Input, Label, Spinner, TextField } from '@heroui/react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { formatPln, type BookingDto, type BookingSummaryDto } from '@repo/shared';
import { PageHeader } from '../components/AppHeader';
import { PHASE_LABELS, mutationErrorText } from '../components/booking/phase';
import { StaggerGroup, StaggerItem } from '../components/motion';
import { formatDayLong, intlTag, warsawDate, warsawTime } from '../lib/format';
import { bookingQuery } from '../lib/queries';
import { ApiError, api } from '../lib/api';
import { userAuthFlag } from '../lib/auth';
import { useFlagCookie } from '../lib/hydration';
import { QueryError } from '../components/QueryError';
import { forgetBooking, useRecentBookings } from '../lib/recent-bookings';
import { m } from '../paraglide/messages.js';
import { noindexMeta } from '../lib/seo';
import { spotName } from '../lib/spots';

export const Route = createFileRoute('/bookings')({
  head: () => ({ meta: noindexMeta(m.seo_title_bookings()) }),
  component: MyBookingsPage
});

function MyBookingsPage() {
  // localStorage is browser-only: null through SSR and hydration
  const stored = useRecentBookings();
  const signedIn = useFlagCookie(userAuthFlag);

  const results = useQueries({
    queries: (stored ?? []).map(({ id }) => bookingQuery(id))
  });
  // A signed-in guest also sees what their account booked on any device
  const mine = useQuery({
    queryKey: ['bookings', 'mine'],
    queryFn: ({ signal }) => api.myBookings(signal),
    enabled: signedIn
  });

  // A stored booking the API no longer shows us is gone (or never ours): forget it
  const goneIds = results.flatMap((result, index) =>
    result.error instanceof ApiError && result.error.status === 404 && stored?.[index]
      ? [stored[index].id]
      : []
  );
  const goneKey = goneIds.join(',');
  useEffect(() => {
    for (const id of goneKey.split(',')) if (id) forgetBooking(id);
  }, [goneKey]);

  // Rendered as they arrive: one slow booking no longer holds the whole list
  const byId = new Map<string, BookingDto>();
  for (const booking of [...results.map(result => result.data), ...(mine.data ?? [])]) {
    if (booking) byId.set(booking.id, booking);
  }
  const bookings = [...byId.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const isLoading =
    stored == null ||
    (bookings.length === 0 &&
      (results.some(result => result.isPending) || (signedIn && mine.isPending)));
  // A network/5xx failure with nothing to show must not masquerade as "no bookings"
  const hardFailure =
    results.some(
      result => result.error && !(result.error instanceof ApiError && result.error.status === 404)
    ) || mine.isError;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="bookings" />
      <main id="main" className="mt-8 flex-1">
        <h2 className="mb-4 text-xl font-semibold text-creme">{m.my_bookings_title()}</h2>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : hardFailure && bookings.length === 0 ? (
          <QueryError
            onRetry={() => {
              results.forEach(result => void result.refetch());
              if (signedIn) void mine.refetch();
            }}
          />
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
                <StaggerItem key={booking.id} as="li">
                  <Link
                    to="/booking/$id"
                    params={{ id: booking.id }}
                    className="block rounded-[10px] bg-club-green-light p-4 transition-colors hover:bg-surface-hover"
                  >
                    <BookingLine booking={booking} />
                    <div className="mt-1 text-right text-sm font-semibold text-creme">
                      {formatPln(booking.totalGrosz, intlTag())}
                    </div>
                  </Link>
                </StaggerItem>
              ))}
            </ul>
          </StaggerGroup>
        )}

        <LookupSection />
      </main>
    </div>
  );
}

/** Date, phase and time·spot — shared by managed bookings and lookup summaries. */
function BookingLine({ booking }: { booking: BookingSummaryDto }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="font-semibold capitalize text-creme">
          {formatDayLong(warsawDate(booking.startsAt))}
        </span>
        <span className="text-xs font-semibold text-golden-light">
          {PHASE_LABELS[booking.phase]()}
        </span>
      </div>
      <div className="mt-1 text-sm text-grey-cool">
        {warsawTime(booking.startsAt)}–{warsawTime(booking.endsAt)} ·{' '}
        {spotName(booking.kind, booking.tableLabel)}
      </div>
    </>
  );
}

/**
 * "Do I have a booking?" from another device, by phone. Summaries only: a
 * phone number is easy to know, so it reveals when — never who, and gives no
 * way to manage the booking (that takes its link, the account, or a call).
 */
function LookupSection() {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: (value: string) => api.lookupBookings(value)
  });

  const statusMessage = lookup.isError
    ? mutationErrorText(lookup.error)
    : lookup.data?.length === 0
      ? m.find_booking_none()
      : null;

  return (
    <section className="mt-12 flex flex-col items-center text-center">
      <h2 className="mb-2 text-xl font-semibold text-creme">{m.find_booking_title()}</h2>
      <p className="mb-4 text-sm text-grey-cool">{m.find_booking_hint()}</p>
      <form
        className="flex w-full flex-col gap-3 text-left md:max-w-sm"
        onSubmit={async event => {
          event.preventDefault();
          // The phone metadata is only needed here, on submit: load it then
          const { isValidPhone } = await import('@repo/shared/phone');
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
          <Input placeholder={m.phone_placeholder()} autoComplete="tel" />
          <FieldError>{phoneError}</FieldError>
        </TextField>
        {statusMessage ? (
          <p role="status" className="text-sm text-grey-cool">
            {statusMessage}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="h-11.25 w-full text-lg font-bold"
          isPending={lookup.isPending}
        >
          {m.btn_find()}
        </Button>
      </form>

      {lookup.data && lookup.data.length > 0 ? (
        <div className="mt-6 w-full text-left md:max-w-sm" role="status">
          <ul className="flex flex-col gap-3">
            {lookup.data.map(summary => (
              <li
                key={`${summary.startsAt}-${summary.tableId}`}
                className="rounded-[10px] bg-club-green-light p-4"
              >
                <BookingLine booking={summary} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-grey-cool">{m.find_booking_manage_hint()}</p>
        </div>
      ) : null}
    </section>
  );
}
