import { Spinner } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '../components/site/PageLayout';
import { AuthForms } from '../components/profile/AuthForms';
import { ProfileView } from '../components/profile/ProfileView';
import { userAuthFlag } from '../lib/auth';
import { useFlagCookie, useIsHydrated } from '../lib/hydration';
import { noindexMeta } from '../lib/seo';
import { m } from '../paraglide/messages.js';

export const Route = createFileRoute('/profile')({
  head: () => ({ meta: noindexMeta(m.seo_title_profile()) }),
  component: ProfilePage
});

function ProfilePage() {
  // The signed-in flag cookie is browser-only; both of these read false until
  // the client takes over, so SSR and the hydration render agree.
  const ready = useIsHydrated();
  const hasToken = useFlagCookie(userAuthFlag);

  return (
    <PageLayout script="profile" title={m.nav_profile()} width="narrow">
      {!ready ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : hasToken ? (
        <ProfileView onSignedOut={() => userAuthFlag.clear()} />
      ) : (
        <AuthForms onSignedIn={() => userAuthFlag.refresh()} />
      )}
    </PageLayout>
  );
}
