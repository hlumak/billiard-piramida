import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, m as motion } from '../components/motion';
import { PageHeader } from '../components/AppHeader';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { AdminBookings } from '../components/admin/AdminBookings';
import { AdminCustomers } from '../components/admin/AdminCustomers';
import { AdminLogin } from '../components/admin/AdminLogin';
import { AdminMenu } from '../components/admin/AdminMenu';
import { AdminOverview } from '../components/admin/AdminOverview';
import { AdminStats } from '../components/admin/AdminStats';
import { clearAdminToken, storedAdminToken } from '../lib/admin-api';
import { ApiError } from '../lib/api';
import { m } from '../paraglide/messages.js';
import { noindexMeta } from '../lib/seo';

export const Route = createFileRoute('/admin')({
  head: () => ({ meta: noindexMeta('admin — piramida') }),
  component: AdminPage
});

const TABS = [
  { id: 'overview', label: m.admin_tab_overview },
  { id: 'stats', label: m.admin_tab_stats },
  { id: 'bookings', label: m.admin_tab_bookings },
  { id: 'customers', label: m.admin_tab_customers },
  { id: 'menu', label: m.admin_tab_menu }
] as const;

type TabId = (typeof TABS)[number]['id'];

function AdminPage() {
  const queryClient = useQueryClient();
  // sessionStorage is browser-only; read after mount so SSR and hydration agree
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');
  const [bookingsPhone, setBookingsPhone] = useState('');

  const showCustomerBookings = (phone: string) => {
    setBookingsPhone(phone);
    setTab('bookings');
  };

  useEffect(() => {
    setToken(storedAdminToken());
    setReady(true);
  }, []);

  const logout = () => {
    clearAdminToken();
    queryClient.removeQueries({ queryKey: ['admin'] });
    setToken(null);
  };

  // A rotated ADMIN_TOKEN (401) or disabled admin (503) invalidates the stored
  // token; any admin query hitting that must drop back to the login gate instead
  // of dead-ending in per-tab retry errors.
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      const error = event.query.state.error;
      if (
        event.query.queryKey[0] === 'admin' &&
        error instanceof ApiError &&
        (error.status === 401 || error.status === 503)
      ) {
        logout();
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 pb-10 pt-14 lg:max-w-5xl">
      <PageHeader title="admin" />
      <main className="mt-8 flex-1">
        {!ready ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : token == null ? (
          <>
            <AdminLogin onSuccess={setToken} />
            <div className="mt-8">
              <LocaleSwitcher />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="tablist" className="flex gap-2">
                {TABS.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === entry.id}
                    onClick={() => setTab(entry.id)}
                    className={`h-10 rounded-[10px] px-4 font-semibold transition-colors ${
                      tab === entry.id
                        ? 'bg-golden text-btn-text'
                        : 'bg-club-green-light text-creme hover:bg-surface-hover'
                    }`}
                  >
                    {entry.label()}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <LocaleSwitcher />
                <Button variant="ghost" size="sm" onPress={logout}>
                  {m.admin_logout()}
                </Button>
              </div>
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {tab === 'overview' ? <AdminOverview token={token} /> : null}
                {tab === 'stats' ? <AdminStats token={token} /> : null}
                {tab === 'bookings' ? (
                  <AdminBookings key={bookingsPhone} token={token} initialPhone={bookingsPhone} />
                ) : null}
                {tab === 'customers' ? (
                  <AdminCustomers token={token} onShowBookings={showCustomerBookings} />
                ) : null}
                {tab === 'menu' ? <AdminMenu token={token} /> : null}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
