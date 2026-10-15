import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Spinner } from '@heroui/react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '../components/site/PageLayout';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { AdminShell } from '../components/admin/AdminShell';
import type { AdminPaneId } from '../components/admin/panes';
import { AdminBookings } from '../components/admin/AdminBookings';
import { AdminCustomers } from '../components/admin/AdminCustomers';
import { AdminBlacklist } from '../components/admin/AdminBlacklist';
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
  head: () => ({ meta: noindexMeta('Admin — Piramida') }),
  component: AdminPage
});

/** What the panes need from the page: the customers → bookings hand-off. */
interface PaneContext {
  bookingsPhone: string;
  showCustomerBookings: (phone: string) => void;
  open: (pane: AdminPaneId) => void;
}

/** What each section shows. A Record over the ids: a section without a pane fails to compile. */
const PANES: Record<AdminPaneId, (context: PaneContext) => ReactNode> = {
  overview: ({ open }) => <AdminOverview onOpen={open} />,
  schedule: ({ showCustomerBookings }) => <AdminSchedule onShowBooking={showCustomerBookings} />,
  stats: () => <AdminStats />,
  // Keyed by the phone handed over, so a new hand-off starts a fresh search
  bookings: ({ bookingsPhone }) => (
    <AdminBookings key={bookingsPhone} initialPhone={bookingsPhone} />
  ),
  customers: ({ showCustomerBookings }) => <AdminCustomers onShowBookings={showCustomerBookings} />,
  blacklist: () => <AdminBlacklist />,
  menu: () => <AdminMenu />,
  news: () => <AdminNews />,
  tournaments: () => <AdminTournaments />,
  settings: () => <AdminVenueConfig />
};

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
  const [pane, setPane] = useState<AdminPaneId>('overview');
  const [bookingsPhone, setBookingsPhone] = useState('');

  const showCustomerBookings = (phone: string) => {
    setBookingsPhone(phone);
    setPane('bookings');
  };

  if (ready && signedIn) {
    return (
      <AdminShell
        pane={pane}
        onSelect={setPane}
        onSearchPhone={showCustomerBookings}
        onLogout={session.logout}
        isLoggingOut={session.isLoggingOut}
        logoutFailed={session.logoutFailed}
      >
        {/* key remounts the pane so the CSS entrance replays per section */}
        <div key={pane} className="anim-reveal">
          {PANES[pane]({ bookingsPhone, showCustomerBookings, open: setPane })}
        </div>
      </AdminShell>
    );
  }

  return (
    <PageLayout script="admin" title={m.page_admin()} footer={false}>
      {!ready ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : (
        <>
          <AdminLogin onSuccess={session.signedIn} />
          <div className="mt-8 flex justify-center">
            <LocaleSwitcher />
          </div>
        </>
      )}
    </PageLayout>
  );
}
