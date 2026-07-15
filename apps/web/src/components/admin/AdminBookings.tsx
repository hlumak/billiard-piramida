import { useEffect, useState } from 'react';
import { Button, Input, Spinner } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatPln,
  hoursForDate,
  type BookingDto,
  type BookingStatus,
  type IsoDate
} from '@repo/shared';
import { adminApi, adminBookingsQuery, type AdminBookingFilters } from '../../lib/admin-api';
import { api } from '../../lib/api';
import { formatPhone } from '@repo/shared/phone';
import { intlTag, warsawDate, warsawHour, warsawTime } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';
import { StaggerGroup, StaggerItem } from '../motion';
import { PHASE_LABELS, PHASE_STYLES } from '../booking/phase';
import { AdminDatePicker } from './AdminDatePicker';
import { AdminNewBooking } from './AdminNewBooking';

const STATUS_FILTERS: { value: BookingStatus | undefined; label: () => string }[] = [
  { value: undefined, label: m.admin_all_statuses },
  { value: 'confirmed', label: m.phase_upcoming },
  { value: 'cancelled', label: m.phase_cancelled }
];

function RowActions({ token, booking }: { token: string; booking: BookingDto }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const extend = useMutation({
    mutationFn: () => api.extendBooking(booking.id, 1),
    onSuccess: invalidate
  });
  const cancel = useMutation({
    mutationFn: () => adminApi.cancelBooking(token, booking.id),
    onSuccess: invalidate
  });

  if (booking.phase !== 'upcoming' && booking.phase !== 'active') return null;
  // Hide +1h when it would run past closing time (the API would reject it)
  const closeHour = hoursForDate(warsawDate(booking.startsAt)).close;
  const canExtend = warsawHour(booking.endsAt) < closeHour;
  return (
    <div className="flex gap-1.5">
      {canExtend ? (
        <Button
          size="sm"
          variant="outline"
          className="border-golden text-creme"
          isPending={extend.isPending}
          onPress={() => extend.mutate()}
        >
          {m.admin_extend_1h()}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="danger-soft"
        isPending={cancel.isPending}
        onPress={() => cancel.mutate()}
      >
        {m.phase_cancelled()}
      </Button>
    </div>
  );
}

export function AdminBookings({
  token,
  initialPhone = ''
}: {
  token: string;
  initialPhone?: string;
}) {
  const [date, setDate] = useState<IsoDate | undefined>(undefined);
  const [status, setStatus] = useState<BookingStatus | undefined>(undefined);
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [phone, setPhone] = useState(initialPhone);

  // Debounce the phone search so we don't refetch per keystroke
  useEffect(() => {
    const timer = setTimeout(() => setPhone(phoneInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [phoneInput]);

  const filters: AdminBookingFilters = {
    date,
    status,
    phone: phone !== '' ? phone : undefined
  };
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
        <Input
          aria-label={m.admin_search_phone()}
          placeholder={m.admin_search_phone()}
          value={phoneInput}
          onChange={event => setPhoneInput(event.target.value)}
          className="w-44"
        />
        <div className="ml-auto">
          <AdminNewBooking token={token} />
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
                      {booking.discountGrosz > 0 ? (
                        <span className="ml-1 text-xs font-medium text-grey-cool">
                          (−{formatPln(booking.discountGrosz, intlTag())})
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-creme">
                      {booking.customerName} ·{' '}
                      <a
                        href={`tel:${booking.customerPhone.replaceAll(' ', '')}`}
                        className="text-golden hover:underline"
                      >
                        {formatPhone(booking.customerPhone)}
                      </a>
                      {booking.items.length > 0 ? (
                        <span className="ml-2 text-xs text-grey-cool">
                          {booking.items.map(item => `${item.slug} × ${item.quantity}`).join(', ')}
                        </span>
                      ) : null}
                    </span>
                    <RowActions token={token} booking={booking} />
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
