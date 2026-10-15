import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { PageLayout } from '../components/site/PageLayout';
import { BookingDetails } from '../components/booking/BookingDetails';
import { ApiError } from '../lib/api';
import { bookingQuery, menuQuery } from '../lib/queries';
import { m } from '../paraglide/messages.js';
import { noindexMeta } from '../lib/seo';
import { getLocale } from '../paraglide/runtime.js';

/** Booking ids are UUIDs; anything else cannot be one */
const BOOKING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute('/booking/$id')({
  // Canonical property order (validateSearch → loader → head): each step feeds
  // the next one's inferred types
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search.new === true || search.new === 'true' ? { new: true } : {},
  // The booking needs its secret, which lives in this browser (or the link's
  // fragment) and never reaches the server — so it is only fetched client-side.
  // Errors (404) are owned by the component — except an id that is not a
  // booking id at all, which the server render can answer 404 for itself
  // (a well-formed unknown id cannot be told apart from one whose secret is
  // simply not here, so that one stays a 200 with "not found").
  loader: ({ context, params }) => {
    if (!BOOKING_ID.test(params.id)) throw notFound();
    return Promise.allSettled([
      typeof window === 'undefined'
        ? null
        : context.queryClient.ensureQueryData(bookingQuery(params.id)),
      context.queryClient.ensureQueryData(menuQuery(getLocale()))
    ]);
  },
  head: () => ({ meta: noindexMeta(m.booking_title()) }),
  component: BookingPage,
  notFoundComponent: () => (
    <PageLayout script="booking" title={m.booking_title()}>
      <BookingMissing message={m.booking_not_found()} />
    </PageLayout>
  )
});

function BookingMissing({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <p className="text-grey-cool">{message}</p>
      <Link to="/" className="font-semibold text-golden">
        {m.go_home()}
      </Link>
    </div>
  );
}

function BookingPage() {
  const { id } = Route.useParams();
  const { new: justCreated } = Route.useSearch();
  const { data: booking, isPending, error } = useQuery(bookingQuery(id));
  // A fresh booking opens with its own "confirmed" heading instead of the title
  // — only once it is here: while it loads or if it fails, the page keeps its title
  const celebrate = justCreated === true && booking !== undefined && booking.phase !== 'cancelled';

  return (
    <PageLayout script="booking" title={m.booking_title()} showTitle={!celebrate}>
      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : booking ? (
        <BookingDetails booking={booking} justCreated={justCreated === true} />
      ) : (
        <BookingMissing
          message={
            error instanceof ApiError && error.status === 404
              ? m.booking_not_found()
              : m.err_generic()
          }
        />
      )}
    </PageLayout>
  );
}
