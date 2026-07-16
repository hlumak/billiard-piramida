import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { BookingDetails } from '../components/booking/BookingDetails';
import { ApiError } from '../lib/api';
import { bookingQuery, menuQuery } from '../lib/queries';
import { m } from '../paraglide/messages.js';
import { noindexMeta } from '../lib/seo';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/booking/$id')({
  // Canonical property order (validateSearch → loader → head): each step feeds
  // the next one's inferred types
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search.new === true || search.new === 'true' ? { new: true } : {},
  // Prefetch for SSR and hover-preload; errors (404) are owned by the component
  loader: ({ context, params }) =>
    Promise.allSettled([
      context.queryClient.ensureQueryData(bookingQuery(params.id)),
      context.queryClient.ensureQueryData(menuQuery(getLocale()))
    ]),
  head: () => ({ meta: noindexMeta(m.booking_title()) }),
  component: BookingPage
});

function BookingPage() {
  const { id } = Route.useParams();
  const { new: justCreated } = Route.useSearch();
  const { data: booking, isPending, error } = useQuery(bookingQuery(id));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="booking" />
      <main className="mt-8 flex-1">
        {isPending ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : booking ? (
          <BookingDetails booking={booking} justCreated={justCreated === true} />
        ) : (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-grey-cool">
              {error instanceof ApiError && error.status === 404
                ? m.booking_not_found()
                : m.err_generic()}
            </p>
            <Link to="/" className="font-semibold text-golden">
              {m.go_home()}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
