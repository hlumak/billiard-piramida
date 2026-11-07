import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { MenuContent } from '../components/site/MenuContent';
import { tournamentsQuery } from '../lib/queries';
import { noindexMeta } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/menu')({
  // Links only, every one of them also in the header and footer: nothing for
  // a search result. noindex still lets crawlers follow the links.
  head: () => ({ meta: noindexMeta(m.seo_title_menu()) }),
  component: MenuPage
});

/**
 * The menu as a page of its own. Once the app is interactive the header's
 * burger opens the same content as a sheet over the current page; this is
 * where the burger leads before that (or without JavaScript).
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
