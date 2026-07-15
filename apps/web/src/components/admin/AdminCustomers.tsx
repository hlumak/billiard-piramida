import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { formatPln } from '@repo/shared';
import { adminCustomersQuery } from '../../lib/admin-api';
import { intlTag, warsawDate } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { StaggerGroup, StaggerItem } from '../motion';
import { QueryError } from '../QueryError';

export function AdminCustomers({ token }: { token: string }) {
  const { data: customers, isPending, isError, refetch } = useQuery(adminCustomersQuery(token));

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !customers) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  if (customers.length === 0) {
    return <p className="py-10 text-center text-grey-cool">{m.admin_no_results()}</p>;
  }

  return (
    <StaggerGroup>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {customers.map(customer => (
          <StaggerItem key={customer.phone}>
            <li className="rounded-[10px] bg-club-green-light p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-creme">{customer.name}</span>
                <a
                  href={`tel:${customer.phone.replaceAll(' ', '')}`}
                  className="text-sm text-golden hover:underline"
                >
                  {customer.phone}
                </a>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-grey-cool">
                <span>
                  {m.admin_bookings_count()}:{' '}
                  <span className="font-semibold text-creme">{customer.bookingsCount}</span>
                  {customer.cancelledCount > 0 ? (
                    <span>
                      {' '}
                      ({m.phase_cancelled()}: {customer.cancelledCount})
                    </span>
                  ) : null}
                </span>
                <span>
                  {m.admin_total_spent()}:{' '}
                  <span className="font-semibold text-golden">
                    {formatPln(customer.totalSpentGrosz, intlTag())}
                  </span>
                </span>
                <span>
                  {m.admin_last_visit()}:{' '}
                  <span className="text-creme">{warsawDate(customer.lastSeen)}</span>
                </span>
              </div>
            </li>
          </StaggerItem>
        ))}
      </ul>
    </StaggerGroup>
  );
}
