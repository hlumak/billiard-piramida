import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '../components/site/PageLayout';
import { ReadyToPlay } from '../components/site/ReadyToPlay';
import { VenueMap } from '../components/venue/VenueMap';
import { VisitCard } from '../components/venue/VisitCard';
import { m } from '../paraglide/messages.js';
import { pageHead } from '../lib/seo';

export const Route = createFileRoute('/contacts')({
  head: ({ match }) => pageHead(m.seo_title_contacts(), m.seo_desc_contacts(), match.pathname),
  component: ContactsPage
});

/**
 * Where the club is and when it is open, beside the map — the same pairing
 * as the home page's "find us", with the map kept on a phone too: here it is
 * what the visitor came for.
 */
function ContactsPage() {
  return (
    <PageLayout script="contacts" title={m.nav_contacts()}>
      <div className="anim-reveal grid gap-6 lg:grid-cols-[5fr_7fr]">
        <VisitCard />
        <VenueMap className="h-80 lg:h-auto" />
      </div>
      <ReadyToPlay className="mt-10 md:mt-18" />
    </PageLayout>
  );
}
