import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '../components/site/PageLayout';
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
      loaderData ? `${loaderData.title} — Piramida` : m.seo_title_tournaments(),
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

/** The announcement carries its own h1 (the tournament's name), so no page title above it. */
function TournamentShell({
  children,
  showTitle = true
}: {
  children: React.ReactNode;
  showTitle?: boolean;
}) {
  return (
    <PageLayout script="tournament" title={m.tournament_badge()} showTitle={showTitle}>
      {children}
    </PageLayout>
  );
}

function TournamentPage() {
  const { slug } = Route.useParams();
  // The loader has it (or has already answered 404 / the error page)
  const { data: tournament } = useSuspenseQuery(tournamentQuery(slug, getLocale()));

  return (
    <TournamentShell showTitle={false}>
      <TournamentView tournament={tournament} />
    </TournamentShell>
  );
}
