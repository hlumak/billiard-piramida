import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { formatPln } from '@repo/shared';
import { adminStatsQuery } from '../../lib/admin-api';
import { intlTag } from '../../lib/format';
import { menuQuery } from '../../lib/queries';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { Reveal, StaggerGroup, StaggerItem } from '../motion';
import { QueryError } from '../QueryError';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <StaggerItem className="rounded-[10px] bg-club-green-light p-4">
      <p className="text-xs text-grey-cool">{label}</p>
      <p className="mt-1 text-2xl font-bold text-golden">{value}</p>
    </StaggerItem>
  );
}

export function AdminOverview() {
  const { data: stats, isPending, isError, refetch } = useQuery(adminStatsQuery());
  const { data: menu } = useQuery(menuQuery(getLocale()));

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !stats) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  const nameBySlug = new Map(menu?.map(item => [item.slug, item.name]));

  return (
    <div className="flex flex-col gap-4">
      <StaggerGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label={m.admin_today_bookings()} value={String(stats.todayBookings)} />
        <StatCard label={m.admin_active_now()} value={String(stats.activeNow)} />
        <StatCard label={m.admin_upcoming_today()} value={String(stats.upcomingToday)} />
        <StatCard
          label={m.admin_revenue_today()}
          value={formatPln(stats.todayRevenueGrosz, intlTag())}
        />
        <StatCard
          label={m.admin_revenue_week()}
          value={formatPln(stats.weekRevenueGrosz, intlTag())}
        />
      </StaggerGroup>

      <Reveal delay={0.2} className="rounded-[10px] bg-club-green-light p-4">
        <h3 className="mb-2 font-semibold text-golden">{m.admin_top_items()}</h3>
        {stats.topItems.length === 0 ? (
          <p className="text-sm text-grey-cool">{m.admin_no_results()}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-creme">
            {stats.topItems.map(item => (
              <li key={item.foodItemId} className="flex justify-between">
                <span>{nameBySlug.get(item.slug) ?? item.slug}</span>
                <span className="font-semibold text-golden">× {item.totalQuantity}</span>
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </div>
  );
}
