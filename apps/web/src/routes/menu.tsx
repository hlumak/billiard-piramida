import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { MenuContent } from '../components/site/MenuContent';
import { tournamentsQuery } from '../lib/queries';
import { pageHead } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/menu')({
  head: ({ match }) => pageHead(m.seo_title_menu(), m.seo_desc_menu(), match.pathname),
  component: MenuPage
});

/**
 * The menu as a page of its own. Once the app is interactive the header's
 * burger opens the same content as a sheet over the current page; this is
 * where the burger leads before that (or without JavaScript), and what the
 * sitemap lists.
 */
function MenuPage() {
  const { data: tournaments } = useQuery(tournamentsQuery(getLocale()));
  return (
    <main id="main" className="min-h-dvh bg-club-green-dark">
      <h1 className="sr-only">{m.nav_menu()}</h1>
      <MenuContent
        tournamentsOpen={tournaments?.some(t => t.registrationState === 'open') ?? false}
      />
    </main>
  );
}
