import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { hoursForDate, TABLES_COUNT, type BookingDto, type IsoDate } from '@repo/shared';
import { formatPhone } from '@repo/shared/phone';
import { adminBookingsQuery } from '../../lib/admin-api';
import { availabilityLive } from '../../lib/availability-live';
import { addDays, formatDayLong, formatHour, warsawHour, warsawToday } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';
import { AdminDatePicker } from './AdminDatePicker';
import { AdminNewBookingModal, type NewBookingPrefill } from './AdminNewBooking';

const TABLE_IDS = Array.from({ length: TABLES_COUNT }, (_, i) => i + 1);

/** (tableId, hour) → the confirmed booking covering that hour. Bookings are
 *  hour-aligned and never cross midnight (close is 23 at the latest). */
function occupancyOf(bookings: BookingDto[]): Map<string, BookingDto> {
  const map = new Map<string, BookingDto>();
  for (const booking of bookings) {
    for (let h = warsawHour(booking.startsAt); h < warsawHour(booking.endsAt); h++) {
      map.set(`${booking.tableId}:${h}`, booking);
    }
  }
  return map;
}

/** One table's row of grid cells: free hours are buttons that seed a new
 *  booking; a booking renders as a single block spanning all its hours. */
function TableRow({
  tableId,
  open,
  close,
  occupancy,
  nowHour,
  isPastDate,
  onPickSlot,
  onShowBooking
}: {
  tableId: number;
  open: number;
  close: number;
  occupancy: Map<string, BookingDto>;
  /** Current Warsaw hour when the grid shows today, else null */
  nowHour: number | null;
  isPastDate: boolean;
  onPickSlot: (startHour: number) => void;
  onShowBooking: (phone: string) => void;
}) {
  const isPastHour = (hour: number) => isPastDate || (nowHour !== null && hour < nowHour);

  const cells = [];
  for (let hour = open; hour < close;) {
    const booking = occupancy.get(`${tableId}:${hour}`);
    if (booking) {
      const endHour = warsawHour(booking.endsAt);
      const span = endHour - hour;
      const time = `${formatHour(hour)}–${formatHour(endHour)}`;
      cells.push(
        <button
          key={hour}
          type="button"
          style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
          onClick={() => onShowBooking(booking.customerPhone)}
          title={`${booking.customerName} · ${formatPhone(booking.customerPhone)} · ${time}`}
          className={`flex h-12 min-w-0 flex-col items-start justify-center rounded-[10px] bg-club-green-light px-2 text-left transition-colors hover:bg-surface-hover ${
            isPastHour(endHour - 1) ? 'opacity-50' : ''
          }`}
        >
          <span className="w-full truncate text-sm font-semibold text-creme">
            {booking.customerName}
          </span>
          <span className="text-xs text-grey-cool">{time}</span>
        </button>
      );
      hour = endHour;
    } else {
      // The loop mutates `hour`, so the click closure must capture a copy
      const slotHour = hour;
      // Past free hours stay clickable so staff can log a game that already
      // started today (the admin create endpoint allows past-today starts).
      cells.push(
        <button
          key={slotHour}
          type="button"
          aria-label={`${m.table_n({ n: tableId })}, ${formatHour(slotHour)} — ${m.admin_free()}`}
          onClick={() => onPickSlot(slotHour)}
          className={`h-12 rounded-[10px] border transition-colors hover:bg-surface-hover ${
            isPastHour(slotHour) ? 'border-grey-warm opacity-40' : 'border-golden/60'
          }`}
        />
      );
      hour++;
    }
  }

  return (
    <>
      <div className="sticky left-0 z-10 flex h-12 items-center bg-club-green pr-3 text-sm font-semibold text-creme">
        {m.table_n({ n: tableId })}
      </div>
      {cells}
    </>
  );
}

/** Day grid of tables × opening hours — the phone-booking view: spot a free
 *  slot at a glance, click it to book, click a booking to pull it up. */
export function AdminSchedule({ onShowBooking }: { onShowBooking: (phone: string) => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState<IsoDate>(() => warsawToday());
  const [prefill, setPrefill] = useState<NewBookingPrefill | null>(null);
  const [creating, setCreating] = useState(false);

  const {
    data: bookings,
    isPending,
    isError,
    refetch
  } = useQuery(adminBookingsQuery({ date, status: 'confirmed' }));

  // Same live signal the public wizard uses: any create/extend/cancel on this
  // date refreshes the grid instantly.
  useEffect(
    () =>
      availabilityLive.subscribe(date, changed => {
        queryClient.invalidateQueries({
          queryKey: adminBookingsQuery({ date: changed, status: 'confirmed' }).queryKey
        });
      }),
    [date, queryClient]
  );

  const today = warsawToday();
  const nowHour = date === today ? warsawHour(new Date()) : null;
  const { open, close } = hoursForDate(date);
  const hours = Array.from({ length: close - open }, (_, i) => open + i);
  const occupancy = occupancyOf(bookings ?? []);

  const pickSlot = (tableId: number, startHour: number) => {
    setPrefill({ date, startHour, tableId });
    setCreating(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={m.admin_prev_day()}
          onPress={() => setDate(addDays(date, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <AdminDatePicker value={date} onChange={next => setDate(next ?? warsawToday())} />
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={m.admin_next_day()}
          onPress={() => setDate(addDays(date, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
        {date !== today ? (
          <Button
            size="sm"
            variant="outline"
            className="border-golden text-creme"
            onPress={() => setDate(today)}
          >
            {m.admin_today()}
          </Button>
        ) : null}
        <span className="ml-auto text-sm text-grey-cool">
          {formatDayLong(date)} · {formatHour(open)}–{formatHour(close)}
        </span>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isPending || !bookings ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div
            className="grid min-w-max gap-1"
            style={{ gridTemplateColumns: `auto repeat(${hours.length}, minmax(6rem, 1fr))` }}
          >
            <div className="sticky left-0 z-10 bg-club-green" />
            {hours.map(hour => (
              <div
                key={hour}
                className={`pb-1 text-center text-sm font-semibold ${
                  hour === nowHour ? 'text-golden' : 'text-grey-cool'
                }`}
              >
                {formatHour(hour)}
              </div>
            ))}
            {TABLE_IDS.map(tableId => (
              <TableRow
                key={tableId}
                tableId={tableId}
                open={open}
                close={close}
                occupancy={occupancy}
                nowHour={nowHour}
                isPastDate={date < today}
                onPickSlot={hour => pickSlot(tableId, hour)}
                onShowBooking={onShowBooking}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-grey-cool">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded border border-golden/60" />
          {m.admin_free()}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded bg-club-green-light" />
          {m.admin_booked()}
        </span>
      </div>

      {prefill ? (
        <AdminNewBookingModal
          key={`${prefill.date}:${prefill.startHour}:${prefill.tableId}`}
          isOpen={creating}
          onOpenChange={setCreating}
          prefill={prefill}
        />
      ) : null}
    </div>
  );
}
