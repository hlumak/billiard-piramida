import { useEffect, useState } from 'react';
import { Button, Input, Spinner } from '@heroui/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { formatPln } from '@repo/shared';
import { adminCustomersQuery, normalizePhoneSearch } from '../../lib/admin-api';
import { formatPhone } from '@repo/shared/phone';
import { intlTag, warsawDate } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { StaggerGroup, StaggerItem } from '../motion';
import { QueryError } from '../QueryError';

export function AdminCustomers({ onShowBookings }: { onShowBookings: (phone: string) => void }) {
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');

  // Debounce the phone search (a new search starts again from the first page)
  useEffect(() => {
    const timer = setTimeout(() => setPhone(normalizePhoneSearch(phoneInput)), 300);
    return () => clearTimeout(timer);
  }, [phoneInput]);

  const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery(adminCustomersQuery(phone));
  const customers = data?.pages.flat();

  const search = (
    <Input
      aria-label={m.admin_search_phone()}
      placeholder={m.admin_search_phone()}
      value={phoneInput}
      onChange={event => setPhoneInput(event.target.value)}
      className="mb-4 w-full max-w-xs"
    />
  );

  // Only a failure with nothing to show replaces the list — and the search
  // box stays, so a bad search can be corrected
  if (isError && !customers) {
    return (
      <div>
        {search}
        <QueryError onRetry={() => refetch()} />
      </div>
    );
  }
  if (isPending || !customers) {
    return (
      <div>
        {search}
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div>
        {search}
        <p className="py-10 text-center text-grey-cool">{m.admin_no_results()}</p>
      </div>
    );
  }

  return (
    <div>
      {search}
      <StaggerGroup>
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {customers.map(customer => (
            <StaggerItem
              key={customer.phone}
              as="li"
              className="h-full rounded-[10px] bg-club-green-light p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-creme">{customer.name}</span>
                <span className="flex items-center gap-2">
                  <a
                    href={`tel:${customer.phone.replaceAll(' ', '')}`}
                    className="text-sm text-golden hover:underline"
                  >
                    {formatPhone(customer.phone)}
                  </a>
                  <button
                    type="button"
                    onClick={() => onShowBookings(customer.phone)}
                    className="rounded-[8px] bg-club-green px-2 py-1 text-xs font-semibold text-creme transition-colors hover:bg-surface-hover"
                  >
                    {m.admin_customer_bookings()}
                  </button>
                </span>
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
            </StaggerItem>
          ))}
        </ul>
      </StaggerGroup>
      {hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            className="border-golden text-creme"
            isPending={isFetchingNextPage}
            onPress={() => void fetchNextPage()}
          >
            {m.admin_load_more()}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
