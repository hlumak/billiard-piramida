import { Spinner } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { AuthForms } from '../components/profile/AuthForms';
import { ProfileView } from '../components/profile/ProfileView';
import { userAuthFlag } from '../lib/auth';
import { useFlagCookie, useIsHydrated } from '../lib/hydration';
import { noindexMeta } from '../lib/seo';
import { m } from '../paraglide/messages.js';

export const Route = createFileRoute('/profile')({
  head: () => ({ meta: noindexMeta('profile — piramida') }),
  component: ProfilePage
});

function ProfilePage() {
  // The signed-in flag cookie is browser-only; both of these read false until
  // the client takes over, so SSR and the hydration render agree.
  const ready = useIsHydrated();
  const hasToken = useFlagCookie(userAuthFlag);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="profile" />
      <main className="mt-8 flex-1">
        {!ready ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : hasToken ? (
          <ProfileView onSignedOut={() => userAuthFlag.clear()} />
        ) : (
          <AuthForms onSignedIn={() => userAuthFlag.refresh()} />
        )}
      </main>
    </div>
  );
}
