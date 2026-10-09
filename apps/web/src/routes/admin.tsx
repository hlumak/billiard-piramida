import { useEffect, useId, useRef, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { TabList, tabId, tabPanelId } from '../components/TabList';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { AdminBookings } from '../components/admin/AdminBookings';
import { AdminCustomers } from '../components/admin/AdminCustomers';
import { AdminLogin } from '../components/admin/AdminLogin';
import { AdminMenu } from '../components/admin/AdminMenu';
import { AdminNews } from '../components/admin/AdminNews';
import { AdminOverview } from '../components/admin/AdminOverview';
import { AdminSchedule } from '../components/admin/AdminSchedule';
import { AdminStats } from '../components/admin/AdminStats';
import { AdminTournaments } from '../components/admin/AdminTournaments';
import { AdminVenueConfig } from '../components/admin/AdminVenueConfig';
import { adminApi, adminAuthFlag } from '../lib/admin-api';
import { ApiError } from '../lib/api';
import { useFlagCookie, useIsHydrated } from '../lib/hydration';
import { m } from '../paraglide/messages.js';
import { noindexMeta } from '../lib/seo';

export const Route = createFileRoute('/admin')({
  head: () => ({ meta: noindexMeta('admin — piramida') }),
  component: AdminPage
});

const TABS = [
  { id: 'overview', label: m.admin_tab_overview },
  { id: 'schedule', label: m.admin_tab_schedule },
  { id: 'stats', label: m.admin_tab_stats },
  { id: 'bookings', label: m.admin_tab_bookings },
  { id: 'customers', label: m.admin_tab_customers },
  { id: 'menu', label: m.admin_tab_menu },
  { id: 'news', label: m.admin_tab_news },
  { id: 'tournaments', label: m.admin_tab_tournaments },
  { id: 'settings', label: m.admin_tab_settings }
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * Staff session lifecycle: an explicit logout waits for the server (only it
 * can clear the HttpOnly cookie — on the shared reception PC a failed logout
 * must not look like a successful one), and an admin query answering 401/503
 * (rotated token, expired session, admin disabled) drops back to the login
 * exactly once.
 */
function useAdminSession(queryClient: QueryClient) {
  const dropLocal = () => {
    queryClient.removeQueries({ queryKey: ['admin'] });
    adminAuthFlag.clear();
  };

  const logout = useMutation({
    mutationFn: () => adminApi.logout(),
    onSuccess: dropLocal
  });

  const expiring = useRef(false);
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      // Only a fetch that just failed counts: removeQueries and observer
      // churn re-emit the same errored query and used to log out repeatedly
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      const error = event.action.error;
      if (
        event.query.queryKey[0] !== 'admin' ||
        !(error instanceof ApiError) ||
        (error.status !== 401 && error.status !== 503) ||
        expiring.current
      ) {
        return;
      }
      expiring.current = true;
      // The session is already worthless; clearing its cookies is best-effort
      void adminApi.logout().catch(() => undefined);
      dropLocal();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  return {
    logout: () => logout.mutate(),
    isLoggingOut: logout.isPending,
    logoutFailed: logout.isError,
    /** A fresh sign-in re-arms the expiry handler. */
    signedIn: () => {
      expiring.current = false;
      adminAuthFlag.refresh();
    }
  };
}

function AdminPage() {
  const queryClient = useQueryClient();
  const session = useAdminSession(queryClient);
  // The session flag cookie is browser-only; both of these read false until the
  // client takes over, so SSR and the hydration render agree.
  const signedIn = useFlagCookie(adminAuthFlag);
  const ready = useIsHydrated();
  const [tab, setTab] = useState<TabId>('overview');
  const idBase = useId();
  const [bookingsPhone, setBookingsPhone] = useState('');

  const showCustomerBookings = (phone: string) => {
    setBookingsPhone(phone);
    setTab('bookings');
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 pb-10 pt-14 lg:max-w-5xl">
      <PageHeader title="admin" />
      <main id="main" className="mt-8 flex-1">
        {!ready ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : !signedIn ? (
          <>
            <AdminLogin onSuccess={session.signedIn} />
            <div className="mt-8">
              <LocaleSwitcher />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabList
                idBase={idBase}
                tabs={TABS.map(entry => ({ id: entry.id, label: entry.label() }))}
                selected={tab}
                onSelect={setTab}
                className="flex flex-wrap gap-2"
              />
              <div className="flex items-center gap-3">
                <LocaleSwitcher />
                <Button
                  variant="ghost"
                  size="sm"
                  isPending={session.isLoggingOut}
                  onPress={session.logout}
                >
                  {m.admin_logout()}
                </Button>
              </div>
            </div>
            {session.logoutFailed ? (
              <p role="alert" className="text-sm text-danger-soft-foreground">
                {m.err_signout_failed()}
              </p>
            ) : null}

            {/* key remounts the pane so the CSS entrance replays per tab */}
            <div
              key={tab}
              id={tabPanelId(idBase)}
              role="tabpanel"
              aria-labelledby={tabId(idBase, tab)}
              className="anim-stagger-item"
            >
              {tab === 'overview' ? <AdminOverview /> : null}
              {tab === 'schedule' ? <AdminSchedule onShowBooking={showCustomerBookings} /> : null}
              {tab === 'stats' ? <AdminStats /> : null}
              {tab === 'bookings' ? (
                <AdminBookings key={bookingsPhone} initialPhone={bookingsPhone} />
              ) : null}
              {tab === 'customers' ? (
                <AdminCustomers onShowBookings={showCustomerBookings} />
              ) : null}
              {tab === 'menu' ? <AdminMenu /> : null}
              {tab === 'news' ? <AdminNews /> : null}
              {tab === 'tournaments' ? <AdminTournaments /> : null}
              {tab === 'settings' ? <AdminVenueConfig /> : null}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
