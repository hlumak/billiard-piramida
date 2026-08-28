import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { QueryError } from '../components/QueryError';
import { TournamentCardBody } from '../components/TournamentCard';
import { StaggerGroup, StaggerItem } from '../components/motion';
import { tournamentsQuery } from '../lib/queries';
import { pageMeta } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/tournaments/')({
  // SSR + hover-preload: the list is server data and the page is indexable
  loader: ({ context }) => context.queryClient.ensureQueryData(tournamentsQuery(getLocale())),
  head: () => ({ meta: pageMeta(m.seo_title_tournaments(), m.seo_desc_tournaments()) }),
  component: TournamentsPage
});

function TournamentsPage() {
  const {
    data: tournaments,
    isPending,
    isError,
    refetch
  } = useQuery(tournamentsQuery(getLocale()));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="tournaments" />
      <main className="mt-8 flex-1">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isPending || !tournaments ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : tournaments.length === 0 ? (
          <p className="py-8 text-center text-grey-cool">{m.tournaments_none()}</p>
        ) : (
          <StaggerGroup>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {tournaments.map(tournament => (
                <StaggerItem key={tournament.id}>
                  <Link
                    to="/tournaments/$slug"
                    params={{ slug: tournament.slug }}
                    // Finished and cancelled entries stay readable but recede
                    className={`block h-full overflow-hidden rounded-[10px] bg-club-green-light transition-colors hover:bg-surface-hover ${
                      tournament.registrationState === 'cancelled' ? 'opacity-60' : ''
                    }`}
                  >
                    <TournamentCardBody tournament={tournament} />
                  </Link>
                </StaggerItem>
              ))}
            </ul>
          </StaggerGroup>
        )}
      </main>
    </div>
  );
}
