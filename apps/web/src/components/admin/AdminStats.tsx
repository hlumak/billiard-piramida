import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { formatPln, type IsoDate } from '@repo/shared';
import { adminAnalyticsQuery, adminMonthlyRevenueQuery } from '../../lib/admin-api';
import { formatDay, formatMonthShort, formatMonthYear, intlTag } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';
import { StaggerGroup, StaggerItem } from '../motion';
import { BarChart } from './charts/BarChart';
import { UtilizationBars } from './charts/UtilizationBars';

const DAYS = 30;
const MONTHS = 12;

/**
 * A year of takings, a bar per month. Fetched apart from the 30-day figures
 * so either card can load or fail without holding up the other.
 */
function MonthlyRevenue() {
  const { data, isError, error, refetch } = useQuery(adminMonthlyRevenueQuery(MONTHS));
  if (isError && !data) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" aria-label={m.loading()} />
      </div>
    );
  }
  if (data.every(month => month.revenueGrosz === 0)) {
    return <p className="py-6 text-sm text-grey-cool">{m.admin_no_data()}</p>;
  }
  const bars = data.map((month, i) => {
    const firstDay = `${month.month}-01` as IsoDate;
    // The last bar is the month in progress, which is no month's total yet
    const name =
      i === data.length - 1
        ? `${formatMonthYear(firstDay)} (${m.admin_month_so_far()})`
        : formatMonthYear(firstDay);
    return {
      key: month.month,
      label: formatMonthShort(firstDay),
      value: month.revenueGrosz,
      tooltip: `${name} · ${formatPln(month.revenueGrosz, intlTag())} · ${month.bookings}×`
    };
  });
  return <BarChart data={bars} formatValue={v => formatPln(v, intlTag())} />;
}

export function AdminStats() {
  const { data, isPending, isError, error, refetch } = useQuery(adminAnalyticsQuery(DAYS));

  if (isError && !data) return <QueryError error={error} onRetry={() => refetch()} />;
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

  // Hours of the club's day: a late night's 00:xx comes as 24 and sorts last, but reads "0:00"
  const hourBars = data.startHours.map(h => ({
    key: String(h.hour),
    label: `${h.hour % 24}:00`,
    value: h.bookings,
    tooltip: `${h.hour % 24}:00 · ${h.bookings}`
  }));

  return (
    <StaggerGroup className="flex flex-col gap-4">
      <StaggerItem className="grid grid-cols-2 gap-3">
        <div className="card p-5">
          <p className="text-xs text-grey-cool">{m.admin_total_revenue({ days: DAYS })}</p>
          <p className="mt-1 text-2xl font-bold text-golden">
            {formatPln(totalRevenue, intlTag())}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-grey-cool">{m.admin_total_bookings({ days: DAYS })}</p>
          <p className="mt-1 text-2xl font-bold text-golden">{totalBookings}</p>
        </div>
      </StaggerItem>

      <StaggerItem className="card p-5">
        <h3 className="mb-3 font-semibold text-golden-light">{m.admin_chart_revenue()}</h3>
        {hasData ? (
          <BarChart data={revenueBars} formatValue={v => formatPln(v, intlTag())} />
        ) : (
          <p className="py-6 text-sm text-grey-cool">{m.admin_no_data()}</p>
        )}
      </StaggerItem>

      <StaggerItem className="card p-5">
        <h3 className="mb-3 font-semibold text-golden-light">
          {m.admin_chart_revenue_monthly({ months: MONTHS })}
        </h3>
        <MonthlyRevenue />
      </StaggerItem>

      <StaggerItem className="card p-5">
        <h3 className="mb-3 font-semibold text-golden-light">
          {m.admin_chart_utilization({ days: DAYS })}
        </h3>
        <UtilizationBars tables={data.tables} />
      </StaggerItem>

      <StaggerItem className="card p-5">
        <h3 className="mb-3 font-semibold text-golden-light">{m.admin_chart_hours()}</h3>
        {hourBars.length > 0 ? (
          <BarChart data={hourBars} height={140} formatValue={v => String(v)} />
        ) : (
          <p className="py-6 text-sm text-grey-cool">{m.admin_no_data()}</p>
        )}
      </StaggerItem>
    </StaggerGroup>
  );
}
