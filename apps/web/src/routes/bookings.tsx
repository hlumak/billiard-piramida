import { useEffect, useState } from 'react';
import { FieldError, Input, Label, Spinner, TextField } from '@heroui/react';
import { ChevronRight } from 'lucide-react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { formatPln, sizeOf, type BookingDto, type BookingSummaryDto } from '@repo/shared';
import { PageLayout } from '../components/site/PageLayout';
import { DateBadge } from '../components/booking/DateBadge';
import { PHASE_LABELS, PHASE_STYLES, mutationErrorText } from '../components/booking/phase';
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

/**
 * The guest's bookings: those this browser holds the link to, plus — when
 * signed in — what their account booked on any device. A stored booking the
 * API no longer shows is forgotten. Rendered as they arrive: one slow booking
 * does not hold up the whole list.
 */
function useMyBookings() {
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
  const retry = () => {
    results.forEach(result => void result.refetch());
    if (signedIn) void mine.refetch();
  };

  return { bookings, isLoading, hardFailure, retry, signedIn };
}

function MyBookingsPage() {
  const { bookings, isLoading, hardFailure, retry, signedIn } = useMyBookings();
  // Soonest first while still ahead; most recent first once over
  const upcoming = bookings
    .filter(booking => booking.phase === 'upcoming' || booking.phase === 'active')
    .reverse();
  const past = bookings.filter(booking => !upcoming.includes(booking));

  return (
    <PageLayout script="bookings" title={m.nav_my_bookings()} width="medium">
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : hardFailure && bookings.length === 0 ? (
        <QueryError onRetry={retry} />
      ) : bookings.length === 0 ? (
        <div className="card anim-reveal flex flex-col items-center gap-5 px-6 py-12 text-center">
          <p className="text-lg text-cream-soft">{m.no_bookings()}</p>
          <Link to="/book" className="btn-gold h-12.5 px-7 text-[15px]">
            {m.book_now()}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {upcoming.length > 0 ? (
            <BookingGroup title={m.bookings_upcoming()} bookings={upcoming} />
          ) : null}
          {past.length > 0 ? <BookingGroup title={m.bookings_past()} bookings={past} past /> : null}
        </div>
      )}

      <LookupSection signedIn={signedIn} />
    </PageLayout>
  );
}

function BookingGroup({
  title,
  bookings,
  past = false
}: {
  title: string;
  bookings: BookingDto[];
  past?: boolean;
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-[13px] font-bold tracking-[0.18em] text-golden-light uppercase">
        {title}
      </h2>
      <ul className="mt-3.5 flex flex-col gap-3">
        {bookings.map(booking => (
          <li key={booking.id} className="anim-stagger-item">
            <Link
              to="/booking/$id"
              params={{ id: booking.id }}
              className="card lift flex items-center gap-4 p-4 md:gap-5 md:p-5"
            >
              <BookingLine booking={booking} muted={past} />
              <span className="flex-none text-right font-bold text-golden tabular-nums md:text-lg">
                {formatPln(booking.totalGrosz, intlTag())}
              </span>
              <ChevronRight
                aria-hidden
                className="hidden size-5 flex-none text-grey-cool sm:block"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Day, time, phase and spot — shared by managed bookings and lookup summaries. */
function BookingLine({ booking, muted }: { booking: BookingSummaryDto; muted: boolean }) {
  const date = warsawDate(booking.startsAt);
  const size = sizeOf(booking.tableId);
  return (
    <>
      <DateBadge date={date} muted={muted} />
      <div className="min-w-0 flex-1">
        <p className="sr-only">{formatDayLong(date)}</p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-lg font-bold tabular-nums md:text-xl">
            {warsawTime(booking.startsAt)}–{warsawTime(booking.endsAt)}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PHASE_STYLES[booking.phase]}`}
          >
            {PHASE_LABELS[booking.phase]()}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-cream-soft">
          {spotName(booking.kind, booking.tableLabel)}
          {size ? ` · ${size}` : ''}
        </p>
      </div>
    </>
  );
}

/**
 * "Do I have a booking?" from another device, by phone. Summaries only: a
 * phone number is easy to know, so it reveals when — never who, and gives no
 * way to manage the booking (that takes its link, the account, or a call).
 */
function LookupSection({ signedIn }: { signedIn: boolean }) {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // A read, kept as a mutation because it runs on submit: its result is shown
  // from `lookup.data` and no cached query holds it, so nothing to invalidate
  const lookup = useMutation({
    mutationFn: (value: string) => api.lookupBookings(value)
  });

  const statusMessage = lookup.isError
    ? mutationErrorText(lookup.error)
    : lookup.data?.length === 0
      ? m.find_booking_none()
      : null;

  return (
    <section className="panel mt-12 grid gap-6 p-5 md:mt-14 md:grid-cols-2 md:gap-8 md:p-8">
      <div>
        <h2 className="text-xl font-bold">{m.find_booking_title()}</h2>
        <p className="mt-2 text-sm leading-relaxed text-grey-cool">{m.find_booking_hint()}</p>
        {signedIn ? null : (
          <p className="mt-3 text-sm leading-relaxed text-grey-cool">
            {m.find_booking_signin()}{' '}
            <Link to="/profile" className="font-semibold text-golden-light hover:underline">
              {m.sign_in()}
            </Link>
          </p>
        )}
      </div>
      <form
        className="fields-roomy flex flex-col gap-3"
        // A client-side submission on purpose: the phone check loads its
        // metadata lazily, and the lookup goes to the separate API service
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
        <button
          type="submit"
          disabled={lookup.isPending}
          aria-busy={lookup.isPending}
          className="btn-gold h-12.5 w-full text-[15px]"
        >
          {m.btn_find()}
        </button>
      </form>

      {lookup.data && lookup.data.length > 0 ? (
        <div className="md:col-span-2" role="status">
          <ul className="flex flex-col gap-3">
            {lookup.data.map(summary => (
              <li
                key={`${summary.startsAt}-${summary.tableId}`}
                className="card flex items-center gap-4 p-4 md:gap-5"
              >
                <BookingLine booking={summary} muted={false} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-grey-cool">{m.find_booking_manage_hint()}</p>
        </div>
      ) : null}
    </section>
  );
}
