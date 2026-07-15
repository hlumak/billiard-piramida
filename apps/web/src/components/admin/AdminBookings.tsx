import { useState } from 'react';
import { Spinner } from '@heroui/react';
import type { IsoDate } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { formatPln, type BookingStatus } from '@repo/shared';
import { adminBookingsQuery, type AdminBookingFilters } from '../../lib/admin-api';
import { intlTag, warsawDate, warsawTime } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { StaggerGroup, StaggerItem } from '../motion';
import { QueryError } from '../QueryError';
import { AdminDatePicker } from './AdminDatePicker';
import { PHASE_LABELS, PHASE_STYLES } from '../booking/phase';

const STATUS_FILTERS: { value: BookingStatus | undefined; label: () => string }[] = [
  { value: undefined, label: m.admin_all_statuses },
  { value: 'confirmed', label: m.phase_upcoming },
  { value: 'cancelled', label: m.phase_cancelled }
];

export function AdminBookings({ token }: { token: string }) {
  const [date, setDate] = useState<IsoDate | undefined>(undefined);
  const [status, setStatus] = useState<BookingStatus | undefined>(undefined);

  const filters: AdminBookingFilters = { date, status };
  const {
    data: bookings,
    isPending,
    isError,
    refetch
  } = useQuery(adminBookingsQuery(token, filters));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <AdminDatePicker value={date} onChange={setDate} />
        <div role="group" className="flex gap-2" aria-label={m.admin_all_statuses()}>
          {STATUS_FILTERS.map(filter => (
            <button
              key={filter.value ?? 'all'}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => setStatus(filter.value)}
              className={`h-10 rounded-[10px] px-3 text-sm font-semibold transition-colors ${
                status === filter.value
                  ? 'bg-golden text-btn-text'
                  : 'bg-club-green-light text-creme hover:bg-surface-hover'
              }`}
            >
              {filter.label()}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isPending || !bookings ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : bookings.length === 0 ? (
        <p className="py-10 text-center text-grey-cool">{m.admin_no_results()}</p>
      ) : (
        <StaggerGroup>
          <ul className="flex flex-col gap-2">
            {bookings.map(booking => (
              <StaggerItem key={booking.id}>
                <li className="rounded-[10px] bg-club-green-light p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-creme">
                        {warsawDate(booking.startsAt)} · {warsawTime(booking.startsAt)}–
                        {warsawTime(booking.endsAt)}
                      </span>
                      <span className="text-sm text-grey-cool">
                        {m.table_n({ n: booking.tableId })}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PHASE_STYLES[booking.phase]}`}
                      >
                        {PHASE_LABELS[booking.phase]()}
                      </span>
                    </div>
                    <span className="font-bold text-golden">
                      {formatPln(booking.totalGrosz, intlTag())}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-creme">
                      {booking.customerName} ·{' '}
                      <a
                        href={`tel:${booking.customerPhone.replaceAll(' ', '')}`}
                        className="text-golden hover:underline"
                      >
                        {booking.customerPhone}
                      </a>
                    </span>
                    {booking.items.length > 0 ? (
                      <span className="text-xs text-grey-cool">
                        {booking.items.map(item => `${item.slug} × ${item.quantity}`).join(', ')}
                      </span>
                    ) : null}
                  </div>
                </li>
              </StaggerItem>
            ))}
          </ul>
        </StaggerGroup>
      )}
    </div>
  );
}
