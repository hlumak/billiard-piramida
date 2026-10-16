import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Spinner } from '@heroui/react';
import { Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXTEND_STEP_MINUTES,
  formatPln,
  hoursForDate,
  MAX_BOOKING_MINUTES,
  type BookingDto,
  type BookingStatus,
  type IsoDate
} from '@repo/shared';
import {
  adminApi,
  adminBlacklistQuery,
  adminBookingsQuery,
  ADMIN_BOOKINGS_LIMIT,
  normalizePhoneSearch,
  type AdminBookingFilters
} from '../../lib/admin-api';
import { formatPhone } from '@repo/shared/phone';
import {
  bookingMinutes,
  formatDay,
  intlTag,
  warsawDate,
  warsawTime,
  warsawToday
} from '../../lib/format';
import { menuQuery } from '../../lib/queries';
import { getLocale } from '../../paraglide/runtime.js';
import { m } from '../../paraglide/messages.js';
import { gameName, spotName } from '../../lib/spots';
import { ClearButton } from '../ClearButton';
import { QueryError } from '../QueryError';
import { PHASE_LABELS, PHASE_STYLES, mutationErrorText } from '../booking/phase';
import { AdminDatePicker } from './AdminDatePicker';
import { AdminEditBooking } from './AdminBookingModal';
import { AdminBookingOrder } from './AdminBookingOrder';
import { useVenueConfig } from '../../lib/venue-config';

const STATUS_FILTERS: { value: BookingStatus | undefined; label: () => string }[] = [
  { value: undefined, label: m.admin_all_statuses },
  { value: 'confirmed', label: m.phase_upcoming },
  { value: 'cancelled', label: m.phase_cancelled },
  { value: 'no_show', label: m.phase_no_show }
];

const small =
  'h-9 rounded-[10px] px-3 text-[13px] font-semibold transition-colors aria-busy:cursor-wait aria-busy:opacity-50';
const quiet = `${small} border border-creme/25 text-creme hover:bg-creme/6`;
const danger = `${small} border border-[#ff9b8a]/60 text-danger-soft-foreground hover:bg-[rgb(255_120_100/0.12)]`;

/**
 * A row action that stays focusable while its request runs: `disabled` would
 * drop keyboard focus to the page mid-request. Busy, it ignores clicks and
 * says so to screen readers instead.
 */
function RowButton({
  pending,
  onPress,
  className,
  children
}: {
  pending: boolean;
  onPress: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={() => {
        if (!pending) onPress();
      }}
      className={className}
    >
      {children}
    </button>
  );
}

function RowActions({ booking }: { booking: BookingDto }) {
  const queryClient = useQueryClient();
  const { hours: venueHours } = useVenueConfig();
  // Cancel/extend free or move a slot, so the New-Booking picker (availability
  // query) must refresh too, not just the admin lists.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
    queryClient.invalidateQueries({ queryKey: ['availability'] });
  };

  const extend = useMutation({
    // Through the staff edit, not the guest endpoint (that needs the guest's secret)
    mutationFn: () => {
      const { start, end } = bookingMinutes(booking);
      return adminApi.updateBooking(booking.id, {
        durationMinutes: end - start + EXTEND_STEP_MINUTES
      });
    },
    onSuccess: invalidate
  });
  const cancel = useMutation({
    mutationFn: () => adminApi.cancelBooking(booking.id),
    onSuccess: invalidate
  });
  const restore = useMutation({
    mutationFn: () => adminApi.updateBooking(booking.id, { status: 'confirmed' }),
    onSuccess: invalidate
  });
  const noShow = useMutation({
    mutationFn: () => adminApi.markNoShow(booking.id),
    onSuccess: invalidate
  });

  const live = booking.phase === 'upcoming' || booking.phase === 'active';
  // Hide +30 min when it would run past closing time or the longest booking
  // (the API would reject it)
  const closeMinute = hoursForDate(warsawDate(booking.startsAt), venueHours).close * 60;
  const { start, end } = bookingMinutes(booking);
  const canExtend =
    live &&
    end + EXTEND_STEP_MINUTES <= closeMinute &&
    end - start + EXTEND_STEP_MINUTES <= MAX_BOOKING_MINUTES;
  // Once the start has passed a confirmed booking can turn out a no-show
  const started = booking.phase === 'active' || booking.phase === 'finished';
  const actionError = extend.error ?? cancel.error ?? restore.error ?? noShow.error;
  return (
    <div className="flex flex-col items-start gap-1 lg:items-end">
      <div className="flex flex-wrap gap-1.5 lg:justify-end">
        {booking.status === 'confirmed' ? <AdminBookingOrder booking={booking} /> : null}
        {/* Editable in every phase: a finished booking still gets its record
            corrected, and a cancelled one is restored from the same modal. */}
        <AdminEditBooking booking={booking} />
        {canExtend ? (
          <RowButton pending={extend.isPending} onPress={() => extend.mutate()} className={quiet}>
            {m.extend_30m()}
          </RowButton>
        ) : null}
        {live ? (
          <RowButton pending={cancel.isPending} onPress={() => cancel.mutate()} className={danger}>
            {m.cancel_short()}
          </RowButton>
        ) : null}
        {started ? (
          <RowButton
            pending={noShow.isPending}
            onPress={() => {
              if (window.confirm(m.admin_no_show_confirm())) noShow.mutate();
            }}
            className={danger}
          >
            {m.admin_no_show_btn()}
          </RowButton>
        ) : null}
        {booking.phase === 'cancelled' ? (
          <RowButton
            pending={restore.isPending}
            onPress={() => restore.mutate()}
            className={`btn-gold ${small}`}
          >
            {m.admin_restore_btn()}
          </RowButton>
        ) : null}
        {booking.phase === 'no_show' ? (
          <RowButton pending={restore.isPending} onPress={() => restore.mutate()} className={quiet}>
            {m.admin_came_after_all()}
          </RowButton>
        ) : null}
      </div>
      {actionError ? (
        <span className="text-xs text-danger-soft-foreground">
          {mutationErrorText(actionError)}
        </span>
      ) : null}
    </div>
  );
}

export function AdminBookings({ initialPhone = '' }: { initialPhone?: string }) {
  const [date, setDate] = useState<IsoDate | undefined>(undefined);
  const [status, setStatus] = useState<BookingStatus | undefined>(undefined);
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const searchId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  // Normalized from the start, so the first query searches like the later ones
  const [phone, setPhone] = useState(() => normalizePhoneSearch(initialPhone));

  // Debounce the phone search so we don't refetch per keystroke
  useEffect(() => {
    const timer = setTimeout(() => setPhone(normalizePhoneSearch(phoneInput)), 300);
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
    error,
    refetch
  } = useQuery(adminBookingsQuery(filters));
  const thisYear = warsawToday().slice(0, 4);
  // Localized dish names for the order summary (items carry only a slug)
  const { data: menu } = useQuery(menuQuery(getLocale()));
  const nameBySlug = new Map(menu?.map(item => [item.slug, item.name]));
  // Flag numbers that did not come before, right where staff read the booking
  const { data: blacklist } = useQuery(adminBlacklistQuery());
  const blacklisted = new Set(blacklist?.map(entry => entry.phone));
  const head = 'px-3 py-3.5 text-xs font-bold tracking-[0.08em] text-grey-cool uppercase';

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center gap-3">
        <AdminDatePicker value={date} onChange={setDate} />
        <div
          role="group"
          aria-label={m.admin_all_statuses()}
          className="inline-flex flex-wrap gap-1 rounded-xl bg-club-green-dark p-1"
        >
          {STATUS_FILTERS.map(filter => (
            <button
              key={filter.value ?? 'all'}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => setStatus(filter.value)}
              className="segment h-9 rounded-[9px] px-3.5 text-sm"
            >
              {filter.label()}
            </button>
          ))}
        </div>
        {/* A div with its own label, not a wrapping <label>: the clear button
            inside one would join the field's name */}
        <div className="flex h-11 min-w-55 max-w-80 flex-1 items-center gap-2.5 rounded-xl bg-club-green-light px-3.5 focus-within:ring-2 focus-within:ring-golden">
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
      </div>

      {isError && !bookings ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isPending || !bookings ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : bookings.length === 0 ? (
        <p className="card px-6 py-10 text-center text-grey-cool">{m.admin_no_results()}</p>
      ) : (
        <div>
          {bookings.length >= ADMIN_BOOKINGS_LIMIT ? (
            <p role="status" className="mb-2 text-sm text-grey-cool">
              {m.admin_bookings_capped({ n: ADMIN_BOOKINGS_LIMIT })}
            </p>
          ) : null}
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead className="hidden lg:table-header-group">
                <tr className="text-left">
                  <th scope="col" className={`${head} pl-5`}>
                    {m.admin_col_when()}
                  </th>
                  <th scope="col" className={head}>
                    {m.admin_col_spot()}
                  </th>
                  <th scope="col" className={head}>
                    {m.admin_col_client()}
                  </th>
                  <th scope="col" className={`${head} text-center`}>
                    {m.admin_col_status()}
                  </th>
                  <th scope="col" className={`${head} text-right`}>
                    {m.admin_col_total()}
                  </th>
                  <th scope="col" className={`${head} pr-5`}>
                    <span className="sr-only">{m.admin_col_actions()}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(booking => {
                  const voided = booking.phase === 'cancelled' || booking.phase === 'no_show';
                  const day = warsawDate(booking.startsAt);
                  return (
                    <tr
                      key={booking.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-t border-line px-4 py-3.5 first:border-t-0 lg:table-row lg:first:border-t lg:px-0 lg:py-0"
                    >
                      <td className="whitespace-nowrap lg:py-3.5 lg:pr-3 lg:pl-5">
                        <span className="block font-bold first-letter:uppercase">
                          {/* The unfiltered list reaches back into earlier years */}
                          {formatDay(day, { withYear: !day.startsWith(thisYear) })}
                        </span>
                        <span className="text-grey-cool tabular-nums">
                          {warsawTime(booking.startsAt)}–{warsawTime(booking.endsAt)}
                        </span>
                      </td>
                      <td className="self-center justify-self-end lg:hidden">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-center text-xs font-bold ${PHASE_STYLES[booking.phase]}`}
                        >
                          {PHASE_LABELS[booking.phase]()}
                        </span>
                      </td>
                      <td className="col-span-2 whitespace-nowrap lg:px-3 lg:py-3.5">
                        {spotName(booking.kind, booking.tableLabel)}
                        {/* Which balls to rack — the one thing on this row that
                            is an instruction to the person reading it */}
                        {booking.game ? (
                          <span className="text-grey-cool">
                            {' · '}
                            {gameName(booking.game).toLocaleLowerCase(getLocale())}
                          </span>
                        ) : null}
                      </td>
                      <td className="col-span-2 lg:px-3 lg:py-3.5">
                        <span className="block font-semibold">
                          {booking.customerName}
                          {blacklisted.has(booking.customerPhone) ? (
                            <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger-soft-foreground">
                              {m.admin_blacklisted()}
                            </span>
                          ) : null}
                        </span>
                        <a
                          href={`tel:${booking.customerPhone}`}
                          className="text-golden-light underline decoration-golden-light/45 underline-offset-2 hover:decoration-golden-light"
                        >
                          {formatPhone(booking.customerPhone)}
                        </a>
                        {booking.items.length > 0 ? (
                          <span className="mt-0.5 block text-xs text-grey-cool">
                            {booking.items
                              .map(
                                item =>
                                  `${nameBySlug.get(item.slug) ?? item.slug} × ${item.quantity}`
                              )
                              .join(', ')}
                          </span>
                        ) : null}
                      </td>
                      <td className="hidden text-center lg:table-cell lg:px-3 lg:py-3.5">
                        <span
                          className={`inline-block min-w-29.5 rounded-full px-2.5 py-1 text-center text-xs font-bold ${PHASE_STYLES[booking.phase]}`}
                        >
                          {PHASE_LABELS[booking.phase]()}
                        </span>
                      </td>
                      <td
                        className={`col-span-2 font-bold whitespace-nowrap tabular-nums lg:px-3 lg:py-3.5 lg:text-right ${
                          voided ? 'text-grey-cool' : 'text-golden-light'
                        } ${booking.phase === 'cancelled' ? 'line-through' : ''}`}
                      >
                        {formatPln(booking.totalGrosz, intlTag())}
                        {booking.discountGrosz > 0 ? (
                          <span className="ml-1 text-xs font-medium text-grey-cool no-underline">
                            (−{formatPln(booking.discountGrosz, intlTag())})
                          </span>
                        ) : null}
                      </td>
                      <td className="col-span-2 lg:py-3.5 lg:pr-5 lg:pl-3">
                        <RowActions booking={booking} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
