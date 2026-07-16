import { useEffect, useState } from 'react';
import { Spinner } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { AuthForms } from '../components/profile/AuthForms';
import { ProfileView } from '../components/profile/ProfileView';
import { authToken } from '../lib/auth';
import { noindexMeta } from '../lib/seo';
import { m } from '../paraglide/messages.js';

export const Route = createFileRoute('/profile')({
  head: () => ({ meta: noindexMeta('profile — piramida') }),
  component: ProfilePage
});

function ProfilePage() {
  // localStorage token is browser-only; decide after mount so SSR agrees
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    setHasToken(authToken() !== null);
    setReady(true);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="profile" />
      <main className="mt-8 flex-1">
        {!ready ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : hasToken ? (
          <ProfileView onSignedOut={() => setHasToken(false)} />
        ) : (
          <AuthForms onSignedIn={() => setHasToken(true)} />
        )}
      </main>
    </div>
  );
}
