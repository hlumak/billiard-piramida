import { useEffect, useState } from 'react';
import { Spinner } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  hallOf,
  hoursForDate,
  sizeOf,
  type BookingDto,
  type IsoDate,
  type TableDto
} from '@repo/shared';
import { useVenueConfig } from '../../lib/venue-config';
import { formatPhone } from '@repo/shared/phone';
import { adminBookingsQuery } from '../../lib/admin-api';
import { tablesQuery } from '../../lib/queries';
import { activityName, gameName, spotName } from '../../lib/spots';
import { availabilityLive } from '../../lib/availability-live';
import { addDays, bookingHours, formatHour, warsawHour, warsawToday } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { QueryError } from '../QueryError';
import { PHASE_LABELS } from '../booking/phase';
import { AdminDatePicker } from './AdminDatePicker';
import { useNowMinute } from '../../lib/use-now';
import { AdminBookingModal, type NewBookingPrefill } from './AdminBookingModal';

/** (tableId, hour) → the confirmed booking covering that hour. Bookings are
 *  hour-aligned and never cross midnight; one may end at 24 (see bookingHours). */
function occupancyOf(bookings: BookingDto[]): Map<string, BookingDto> {
  const map = new Map<string, BookingDto>();
  for (const booking of bookings) {
    const { start, end } = bookingHours(booking);
    for (let h = start; h < end; h++) {
      map.set(`${booking.tableId}:${h}`, booking);
    }
  }
  return map;
}

type BlockTone = 'playing' | 'planned' | 'done';

const BLOCK_TONES: Record<BlockTone, string> = {
  playing: 'bg-golden text-btn-text hover:bg-golden-hover',
  planned: 'border border-golden/60 bg-club-green-light text-creme hover:bg-surface-hover',
  done: 'bg-creme/8 text-grey-cool hover:bg-creme/12'
};

/** A booking as one block spanning its hours; clicking it pulls the booking up. */
function BookingCell({
  booking,
  span,
  tone,
  onShowBooking
}: {
  booking: BookingDto;
  /** Grid columns covered, clamped to the grid's closing hour */
  span: number;
  tone: BlockTone;
  onShowBooking: (phone: string) => void;
}) {
  const { start, end } = bookingHours(booking);
  const time = `${formatHour(start)}–${formatHour(end)}`;
  const game = booking.game ? gameName(booking.game).toLocaleLowerCase(getLocale()) : null;
  return (
    <button
      type="button"
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
      onClick={() => onShowBooking(booking.customerPhone)}
      title={`${booking.customerName} · ${formatPhone(booking.customerPhone)} · ${time}`}
      // Above the "now" line, so the line never runs through a name
      className={`relative z-10 flex h-12.5 min-w-0 flex-col items-start justify-center rounded-[10px] px-3 text-left transition-colors ${BLOCK_TONES[tone]}`}
    >
      <span className="w-full truncate text-[13px] font-bold">
        {booking.customerName}
        {tone === 'playing' && game ? ` · ${game}` : ''}
        {/* The colour alone says "playing now" only to those who see it */}
        {tone === 'playing' ? <span className="sr-only">, {PHASE_LABELS.active()}</span> : null}
      </span>
      {tone === 'done' ? null : (
        <span
          className={`w-full truncate text-xs font-semibold ${tone === 'planned' ? 'text-golden-light' : ''}`}
        >
          {formatPhone(booking.customerPhone)}
        </span>
      )}
    </button>
  );
}

/** A free hour: a button that seeds a new booking at that hour. Past free
 *  hours stay clickable so staff can log a game that already started today
 *  (the admin create endpoint allows past-today starts). */
function FreeCell({ label, past, onPick }: { label: string; past: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPick}
      className={`group relative z-10 h-12.5 rounded-[10px] border border-dashed border-creme/14 text-[13px] font-bold text-golden-light transition-colors hover:border-[1.5px] hover:border-golden hover:bg-golden/8 focus-visible:border-golden focus-visible:bg-golden/8 ${
        past ? 'opacity-45' : ''
      }`}
    >
      <span
        aria-hidden
        className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {m.admin_book_slot()}
      </span>
    </button>
  );
}

/** One spot's row: free hours are buttons that seed a new booking; a booking
 *  renders as a single block spanning all its hours. */
function SpotRow({
  spot,
  open,
  close,
  occupancy,
  now,
  isPastDate,
  isToday,
  onPickSlot,
  onShowBooking
}: {
  spot: TableDto;
  open: number;
  close: number;
  occupancy: Map<string, BookingDto>;
  now: number;
  isPastDate: boolean;
  isToday: boolean;
  onPickSlot: (startHour: number) => void;
  onShowBooking: (phone: string) => void;
}) {
  const nowHour = isToday ? warsawHour(now) : null;
  const isPastHour = (hour: number) => isPastDate || (nowHour !== null && hour < nowHour);
  const name = spotName(spot.kind, spot.label);

  const cells = [];
  for (let hour = open; hour < close;) {
    const booking = occupancy.get(`${spot.id}:${hour}`);
    if (booking) {
      const endHour = bookingHours(booking).end;
      const started = Date.parse(booking.startsAt) <= now;
      const ended = Date.parse(booking.endsAt) <= now;
      cells.push(
        <BookingCell
          key={hour}
          booking={booking}
          // A booking can outlast the grid when staff have since moved closing
          // time earlier: clamp, or it would push every following row out of place
          span={Math.min(endHour, close) - hour}
          tone={ended ? 'done' : started ? 'playing' : 'planned'}
          onShowBooking={onShowBooking}
        />
      );
      hour = endHour;
    } else {
      // The loop mutates `hour`, so the click closure must capture a copy
      const slotHour = hour;
      cells.push(
        <FreeCell
          key={slotHour}
          label={`${name}, ${formatHour(slotHour)} — ${m.admin_free()}`}
          past={isPastHour(slotHour)}
          onPick={() => onPickSlot(slotHour)}
        />
      );
      hour++;
    }
  }

  return (
    <>
      <div className="sticky left-0 z-20 flex h-12.5 items-center bg-card pr-3 text-sm font-bold">
        {name}
      </div>
      {cells}
    </>
  );
}

/** Hall 1's tables, the dartboards, then hall 2 — the order a guest walks the room. */
function spotGroups(spots: TableDto[]): { key: string; title: string; spots: TableDto[] }[] {
  const byLabel = (a: TableDto, b: TableDto) => Number(a.label) - Number(b.label);
  const hall = (n: 1 | 2) =>
    spots.filter(spot => spot.kind === 'billiard' && hallOf(spot.id) === n).sort(byLabel);
  const groups = [
    { key: 'hall-1', spots: hall(1) },
    { key: 'darts', spots: spots.filter(spot => spot.kind === 'darts').sort(byLabel) },
    { key: 'hall-2', spots: hall(2) }
  ];
  return groups
    .filter(group => group.spots.length > 0)
    .map(group => {
      const first = group.spots[0];
      const size = first ? sizeOf(first.id) : null;
      const n = first ? hallOf(first.id) : null;
      return {
        key: group.key,
        spots: group.spots,
        title:
          group.key === 'darts' || size === null || n === null
            ? activityName('darts')
            : m.admin_hall_size({ n, size })
      };
    });
}

const legendSwatch = 'h-2.5 w-4 rounded-[3px]';

/** Day grid of spots × opening hours — the phone-booking view: spot a free
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
  // Rows come from the venue's real spots, so seeding a new dartboard shows up
  // here without a code change.
  const { data: spots = [] } = useQuery(tablesQuery());

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

  const now = useNowMinute();
  const today = warsawToday(now);
  const isToday = date === today;
  const { open, close } = hoursForDate(date, useVenueConfig().hours);
  const hours = Array.from({ length: Math.max(close - open, 0) }, (_, i) => open + i);
  const occupancy = occupancyOf(bookings ?? []);

  // Where "now" falls across the opening hours, 0–1; only drawn on today's grid
  const nowFraction = (() => {
    if (!isToday || hours.length === 0) return null;
    const minutes = warsawHour(now) * 60 + new Date(now).getUTCMinutes();
    const fraction = (minutes - open * 60) / ((close - open) * 60);
    return fraction > 0 && fraction < 1 ? fraction : null;
  })();

  const pickSlot = (tableId: number, startHour: number) => {
    setPrefill({ date, startHour, tableId });
    setCreating(true);
  };

  const dayButton =
    'flex size-10 items-center justify-center rounded-[10px] bg-club-green-light text-creme transition-colors hover:bg-surface-hover';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={m.admin_prev_day()}
          onClick={() => setDate(addDays(date, -1))}
          className={dayButton}
        >
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-pressed={isToday}
          onClick={() => setDate(today)}
          className="chip h-10 rounded-[10px] px-3.5 text-sm"
        >
          {m.admin_today()}
        </button>
        <button
          type="button"
          aria-label={m.admin_next_day()}
          onClick={() => setDate(addDays(date, 1))}
          className={dayButton}
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
        <AdminDatePicker value={date} onChange={next => setDate(next ?? warsawToday())} />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-grey-cool lg:ml-auto">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`${legendSwatch} border border-golden/60 bg-club-green-light`}
            />
            {PHASE_LABELS.upcoming().toLocaleLowerCase(getLocale())}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className={`${legendSwatch} bg-golden`} />
            {m.admin_legend_playing()}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className={`${legendSwatch} bg-creme/12`} />
            {PHASE_LABELS.finished().toLocaleLowerCase(getLocale())}
          </li>
        </ul>
      </div>

      {isError && !bookings ? (
        <QueryError onRetry={() => refetch()} />
      ) : isPending || !bookings ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : (
        <div className="card overflow-x-auto px-4 pt-4.5 pb-5 md:px-5">
          <div
            className="relative grid min-w-max gap-1.5"
            style={{ gridTemplateColumns: `110px repeat(${hours.length}, minmax(5.5rem, 1fr))` }}
          >
            <div className="sticky left-0 z-20 bg-card" />
            {hours.map(hour => (
              <div
                key={hour}
                className={`pl-1 text-[13px] font-bold ${
                  isToday && hour === warsawHour(now) ? 'text-golden-light' : 'text-grey-cool'
                }`}
              >
                {formatHour(hour)}
              </div>
            ))}
            {spotGroups(spots).map(group => (
              <div key={group.key} className="contents">
                <p className="sticky left-0 col-span-full mt-2.5 text-[11px] font-bold tracking-[0.16em] text-grey-cool/80 uppercase">
                  {group.title}
                </p>
                {group.spots.map(spot => (
                  <SpotRow
                    key={spot.id}
                    spot={spot}
                    open={open}
                    close={close}
                    occupancy={occupancy}
                    now={now}
                    isPastDate={date < today}
                    isToday={isToday}
                    onPickSlot={hour => pickSlot(spot.id, hour)}
                    onShowBooking={onShowBooking}
                  />
                ))}
              </div>
            ))}
            {nowFraction !== null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 z-0 w-0.5 rounded-full bg-golden"
                style={{ left: `calc(116px + (100% - 116px) * ${nowFraction})` }}
              >
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded-md bg-golden px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-btn-text">
                  {`${String(warsawHour(now)).padStart(2, '0')}:${String(new Date(now).getUTCMinutes()).padStart(2, '0')}`}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {prefill ? (
        <AdminBookingModal
          key={`${prefill.date}:${prefill.startHour}:${prefill.tableId}`}
          isOpen={creating}
          onOpenChange={setCreating}
          prefill={prefill}
        />
      ) : null}
    </div>
  );
}
