import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { TournamentDto } from '@repo/shared';
import { PageLayout } from '../components/site/PageLayout';
import { QueryError } from '../components/QueryError';
import { TournamentCard } from '../components/TournamentCard';
import { tournamentsQuery } from '../lib/queries';
import { pageHead } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/tournaments/')({
  // SSR + hover-preload: the list is server data and the page is indexable
  loader: ({ context }) => context.queryClient.ensureQueryData(tournamentsQuery(getLocale())),
  head: ({ match }) =>
    pageHead(m.seo_title_tournaments(), m.seo_desc_tournaments(), match.pathname),
  component: TournamentsPage
});

/** Played or called off: these go under "past", the rest are still ahead. */
const isOver = (tournament: TournamentDto) =>
  tournament.registrationState === 'completed' || tournament.registrationState === 'cancelled';

function TournamentGroup({ title, tournaments }: { title: string; tournaments: TournamentDto[] }) {
  if (tournaments.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="text-[13px] font-bold tracking-[0.18em] text-golden-light uppercase">
        {title}
      </h2>
      <ul className="mt-3.5 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {tournaments.map(tournament => (
          <li key={tournament.id} className="anim-stagger-item">
            <TournamentCard tournament={tournament} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The list in whichever state its query is in: failed, loading, empty, or grouped. */
function TournamentList() {
  const {
    data: tournaments,
    isPending,
    isError,
    refetch
  } = useQuery(tournamentsQuery(getLocale()));

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !tournaments) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }
  if (tournaments.length === 0) {
    return (
      <p className="card px-6 py-12 text-center text-lg text-cream-soft">{m.tournaments_none()}</p>
    );
  }
  return (
    <div className="flex flex-col gap-10">
      <TournamentGroup
        title={m.tournaments_upcoming()}
        tournaments={tournaments.filter(tournament => !isOver(tournament))}
      />
      <TournamentGroup title={m.tournaments_past()} tournaments={tournaments.filter(isOver)} />
    </div>
  );
}

function TournamentsPage() {
  return (
    <PageLayout script="tournaments" title={m.menu_tournaments()}>
      <TournamentList />
    </PageLayout>
  );
}
