import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { TournamentView } from '../components/tournament/TournamentView';
import { ApiError } from '../lib/api';
import { tournamentQuery } from '../lib/queries';
import { pageMeta } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/tournaments/$slug')({
  // Prefetch for SSR and hover-preload; the 404 is owned by the component
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(tournamentQuery(params.slug, getLocale()))
      .catch(() => null),
  // Named after the tournament: this is the URL that gets shared around
  head: ({ loaderData }) => ({
    meta: pageMeta(
      loaderData ? `${loaderData.title} — piramida` : m.seo_title_tournaments(),
      loaderData?.summary ?? m.seo_desc_tournaments()
    )
  }),
  component: TournamentPage
});

function TournamentPage() {
  const { slug } = Route.useParams();
  const { data: tournament, isPending, error } = useQuery(tournamentQuery(slug, getLocale()));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="tournament" />
      <main className="mt-8 flex-1">
        {isPending ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : tournament ? (
          <TournamentView tournament={tournament} />
        ) : (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-grey-cool">
              {error instanceof ApiError && error.status === 404
                ? m.tournament_not_found()
                : m.err_generic()}
            </p>
            <Link to="/tournaments" className="font-semibold text-golden">
              {m.tournaments_all()}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
