import { useEffect, useId, useRef, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { Search } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { formatPln } from '@repo/shared';
import { adminCustomersQuery, normalizePhoneSearch } from '../../lib/admin-api';
import { formatPhone } from '@repo/shared/phone';
import { formatDay, intlTag, warsawDate, warsawToday } from '../../lib/format';
import { ClearButton } from '../ClearButton';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';

export function AdminCustomers({ onShowBookings }: { onShowBookings: (phone: string) => void }) {
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');

  // Debounce the phone search (a new search starts again from the first page)
  useEffect(() => {
    const timer = setTimeout(() => setPhone(normalizePhoneSearch(phoneInput)), 300);
    return () => clearTimeout(timer);
  }, [phoneInput]);

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useInfiniteQuery(adminCustomersQuery(phone));
  const customers = data?.pages.flat();
  const searchId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const thisYear = warsawToday().slice(0, 4);
  const head = 'px-3 py-3.5 text-xs font-bold tracking-[0.08em] text-grey-cool uppercase';

  // The same search field as the bookings list
  const search = (
    <div className="mb-4 flex h-11 w-full max-w-80 items-center gap-2.5 rounded-xl bg-club-green-light px-3.5 focus-within:ring-2 focus-within:ring-golden">
      <Search aria-hidden className="size-4.5 flex-none text-grey-cool" />
      <label htmlFor={searchId} className="sr-only">
        {m.admin_search_phone()}
      </label>
      <input
        ref={searchInput}
        id={searchId}
        type="search"
        inputMode="tel"
        placeholder={m.admin_search_phone()}
        value={phoneInput}
        onChange={event => setPhoneInput(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-grey-cool/80"
      />
      <ClearButton value={phoneInput} onClear={() => setPhoneInput('')} input={searchInput} />
    </div>
  );

  // Only a failure with nothing to show replaces the list — and the search
  // box stays, so a bad search can be corrected
  if (isError && !customers) {
    return (
      <div>
        {search}
        <QueryError error={error} onRetry={() => refetch()} />
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
      {/* A table like the bookings list: a grid of identical cards made
          the same facts harder to compare from one client to the next */}
      <div className="card overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="hidden lg:table-header-group">
            <tr className="text-left">
              <th scope="col" className={`${head} pl-5`}>
                {m.admin_col_client()}
              </th>
              <th scope="col" className={`${head} text-right`}>
                {m.admin_bookings_count()}
              </th>
              <th scope="col" className={`${head} text-right`}>
                {m.admin_total_spent()}
              </th>
              <th scope="col" className={head}>
                {m.admin_last_visit()}
              </th>
              <th scope="col" className={`${head} pr-5`}>
                <span className="sr-only">{m.admin_col_actions()}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.map(customer => {
              const lastDay = warsawDate(customer.lastSeen);
              return (
                <tr
                  key={customer.phone}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-t border-line px-4 py-3.5 first:border-t-0 lg:table-row lg:first:border-t lg:px-0 lg:py-0"
                >
                  <td className="lg:py-3 lg:pr-3 lg:pl-5">
                    <span className="block font-semibold text-creme">
                      {customer.name}
                      {customer.blacklisted ? (
                        <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger-soft-foreground">
                          {m.admin_blacklisted()}
                        </span>
                      ) : null}
                    </span>
                    <a
                      href={`tel:${customer.phone.replaceAll(' ', '')}`}
                      className="text-golden-light underline decoration-golden-light/45 underline-offset-2 hover:decoration-golden-light"
                    >
                      {formatPhone(customer.phone)}
                    </a>
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums lg:px-3 lg:py-3">
                    <span className="text-xs text-grey-cool lg:hidden">
                      {m.admin_bookings_count()}:{' '}
                    </span>
                    <span className="font-semibold text-creme">{customer.bookingsCount}</span>
                    {customer.cancelledCount > 0 ? (
                      <span className="block text-xs text-grey-cool">
                        {m.admin_view_cancelled()}: {customer.cancelledCount}
                      </span>
                    ) : null}
                    {customer.noShowCount > 0 ? (
                      <span className="block text-xs text-danger-soft-foreground">
                        {m.admin_no_shows({ n: customer.noShowCount })}
                      </span>
                    ) : null}
                  </td>
                  <td className="font-semibold whitespace-nowrap text-golden-light tabular-nums lg:px-3 lg:py-3 lg:text-right">
                    <span className="text-xs font-normal text-grey-cool lg:hidden">
                      {m.admin_total_spent()}:{' '}
                    </span>
                    {formatPln(customer.totalSpentGrosz, intlTag())}
                  </td>
                  <td className="text-right whitespace-nowrap text-creme first-letter:uppercase lg:px-3 lg:py-3 lg:text-left">
                    <span className="text-xs text-grey-cool lg:hidden">
                      {m.admin_last_visit()}:{' '}
                    </span>
                    {formatDay(lastDay, { withYear: !lastDay.startsWith(thisYear) })}
                  </td>
                  <td className="col-span-2 lg:py-3 lg:pr-5 lg:pl-3 lg:text-right">
                    <button
                      type="button"
                      onClick={() => onShowBookings(customer.phone)}
                      className="h-9 rounded-[10px] border border-creme/25 px-3 text-[13px] font-semibold whitespace-nowrap text-creme transition-colors hover:bg-creme/6"
                    >
                      {m.admin_customer_bookings()}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
