import { Spinner } from '@heroui/react';
import { Check } from 'lucide-react';
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
    <PageLayout script="profile" title={m.nav_profile()} width="medium">
      {!ready ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : hasToken ? (
        <ProfileView onSignedOut={() => userAuthFlag.clear()} />
      ) : (
        <div className="anim-reveal mx-auto grid max-w-[880px] grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,440px)] md:gap-10">
          <section className="md:order-first md:pt-4">
            <h2 className="text-xl font-bold md:text-2xl">{m.auth_benefits_title()}</h2>
            <ul className="mt-4 flex flex-col gap-3.5">
              {[m.auth_benefit_autofill(), m.auth_benefit_devices(), m.auth_benefit_optional()].map(
                text => (
                  <li key={text} className="flex gap-3 leading-snug text-cream-soft">
                    <span className="mt-0.5 flex size-5.5 flex-none items-center justify-center rounded-full bg-golden/16 text-golden">
                      <Check aria-hidden className="size-3.5" strokeWidth={3} />
                    </span>
                    {text}
                  </li>
                )
              )}
            </ul>
          </section>
          {/* First on a phone: the form is what the visitor came for */}
          <div className="order-first md:order-last">
            <AuthForms onSignedIn={() => userAuthFlag.refresh()} />
          </div>
        </div>
      )}
    </PageLayout>
  );
}
