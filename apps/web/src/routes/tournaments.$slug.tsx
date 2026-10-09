import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { TournamentView } from '../components/tournament/TournamentView';
import { notFoundOn404 } from '../lib/api';
import { tournamentQuery } from '../lib/queries';
import { pageHead } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/tournaments/$slug')({
  // An unknown (or draft) tournament is a real 404, not a 200 rendering a spinner
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(tournamentQuery(params.slug, getLocale()))
      .catch(notFoundOn404),
  // Named after the tournament: this is the URL that gets shared around
  head: ({ match, loaderData }) =>
    pageHead(
      loaderData ? `${loaderData.title} — piramida` : m.seo_title_tournaments(),
      loaderData?.summary ?? m.seo_desc_tournaments(),
      match.pathname
    ),
  component: TournamentPage,
  notFoundComponent: () => (
    <TournamentShell>
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-grey-cool">{m.tournament_not_found()}</p>
        <Link to="/tournaments" className="font-semibold text-golden">
          {m.tournaments_all()}
        </Link>
      </div>
    </TournamentShell>
  )
});

function TournamentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="tournament" />
      <main id="main" className="mt-8 flex-1">
        {children}
      </main>
    </div>
  );
}

function TournamentPage() {
  const { slug } = Route.useParams();
  // The loader has it (or has already answered 404 / the error page)
  const { data: tournament } = useSuspenseQuery(tournamentQuery(slug, getLocale()));

  return (
    <TournamentShell>
      <TournamentView tournament={tournament} />
    </TournamentShell>
  );
}
