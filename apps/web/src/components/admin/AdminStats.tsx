import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { formatPln } from '@repo/shared';
import { adminAnalyticsQuery } from '../../lib/admin-api';
import { formatDay, intlTag } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';
import { StaggerGroup, StaggerItem } from '../motion';
import { BarChart } from './charts/BarChart';
import { UtilizationBars } from './charts/UtilizationBars';

const DAYS = 30;

export function AdminStats({ token }: { token: string }) {
  const { data, isPending, isError, refetch } = useQuery(adminAnalyticsQuery(token, DAYS));

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  const totalRevenue = data.daily.reduce((sum, d) => sum + d.revenueGrosz, 0);
  const totalBookings = data.daily.reduce((sum, d) => sum + d.bookings, 0);
  const hasData = totalBookings > 0;

  const revenueBars = data.daily.map((d, i) => ({
    key: d.date,
    // Label roughly weekly to keep the dense time axis readable
    label: i % 7 === 0 ? formatDay(d.date) : '',
    value: d.revenueGrosz,
    tooltip: `${formatDay(d.date)} · ${formatPln(d.revenueGrosz, intlTag())} · ${d.bookings}×`
  }));

  const hourBars = data.startHours.map(h => ({
    key: String(h.hour),
    label: `${h.hour}:00`,
    value: h.bookings,
    tooltip: `${h.hour}:00 · ${h.bookings}`
  }));

  return (
    <StaggerGroup className="flex flex-col gap-4">
      <StaggerItem className="grid grid-cols-2 gap-3">
        <div className="rounded-[10px] bg-club-green-light p-4">
          <p className="text-xs text-grey-cool">{m.admin_total_revenue()}</p>
          <p className="mt-1 text-2xl font-bold text-golden">
            {formatPln(totalRevenue, intlTag())}
          </p>
        </div>
        <div className="rounded-[10px] bg-club-green-light p-4">
          <p className="text-xs text-grey-cool">{m.admin_total_bookings()}</p>
          <p className="mt-1 text-2xl font-bold text-golden">{totalBookings}</p>
        </div>
      </StaggerItem>

      <StaggerItem className="rounded-[10px] bg-club-green-light p-4">
        <h3 className="mb-3 font-semibold text-golden">{m.admin_chart_revenue({ days: DAYS })}</h3>
        {hasData ? (
          <BarChart data={revenueBars} formatValue={v => formatPln(v, intlTag())} />
        ) : (
          <p className="py-6 text-sm text-grey-cool">{m.admin_no_data()}</p>
        )}
      </StaggerItem>

      <StaggerItem className="rounded-[10px] bg-club-green-light p-4">
        <h3 className="mb-3 font-semibold text-golden">{m.admin_chart_utilization()}</h3>
        <UtilizationBars tables={data.tables} />
      </StaggerItem>

      <StaggerItem className="rounded-[10px] bg-club-green-light p-4">
        <h3 className="mb-3 font-semibold text-golden">{m.admin_chart_hours()}</h3>
        {hourBars.length > 0 ? (
          <BarChart data={hourBars} height={140} formatValue={v => String(v)} />
        ) : (
          <p className="py-6 text-sm text-grey-cool">{m.admin_no_data()}</p>
        )}
      </StaggerItem>
    </StaggerGroup>
  );
}
