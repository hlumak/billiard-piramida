import { useEffect, useState } from 'react';
import { Spinner } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import {
  closedSpansOn,
  closureSpanOn,
  hallOf,
  hoursForDate,
  SLOT_MINUTES,
  sizeOf,
  type BookingDto,
  type ClosedSpan,
  type IsoDate,
  type TableDto,
  type WeeklyHours
} from '@repo/shared';
import { clubMoment, useVenueConfig } from '../../lib/venue-config';
import { formatPhone } from '@repo/shared/phone';
import { adminBookingsQuery, adminClosuresQuery } from '../../lib/admin-api';
import { closedSpanText } from '../../lib/closures';
import { tablesQuery } from '../../lib/queries';
import { activityName, gameName, spotName } from '../../lib/spots';
import { availabilityLive } from '../../lib/availability-live';
import { addDays, bookingMinutes, formatClock, formatClockRange } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { QueryError } from '../QueryError';
import { PHASE_LABELS, PHASE_STYLES } from '../booking/phase';
import { AdminDatePicker } from './AdminDatePicker';
import { useNowMinute } from '../../lib/use-now';
import { AdminBookingModal, type NewBookingPrefill } from './AdminBookingModal';
import { AdminClosureModal } from './AdminClosures';

/** (tableId, slot start) → the confirmed booking covering that half hour.
 *  Bookings sit on the half-hour grid, on their club day: a late night's
 *  run past midnight as 1440 and up (see bookingMinutes). */
function occupancyOf(bookings: BookingDto[], hours: WeeklyHours): Map<string, BookingDto> {
  const map = new Map<string, BookingDto>();
  for (const booking of bookings) {
    const { start, end } = bookingMinutes(booking, hours);
    for (let t = start; t < end; t += SLOT_MINUTES) {
      map.set(`${booking.tableId}:${t}`, booking);
    }
  }
  return map;
}

type BlockTone = 'playing' | 'planned' | 'done';

const BLOCK_TONES: Record<BlockTone, string> = {
  playing: `${PHASE_STYLES.active} hover:bg-golden-hover`,
  planned: 'border border-golden/60 bg-club-green-light text-creme hover:bg-surface-hover',
  done: 'bg-creme/8 text-grey-cool hover:bg-creme/12'
};

/** A booking as one block spanning its half hours; clicking it pulls the booking up. */
function BookingCell({
  booking,
  span,
  tone,
  onShowBooking
}: {
  booking: BookingDto;
  /** Half-hour columns covered, clamped to the grid's closing time */
  span: number;
  tone: BlockTone;
  onShowBooking: (phone: string) => void;
}) {
  const { start, end } = bookingMinutes(booking);
  const time = formatClockRange(start, end - start);
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

/** A free half hour: a button that seeds a new booking there, showing its
 *  time on hover (the cell is too narrow for words). Past free slots stay
 *  clickable so staff can log a game that already started today (the admin
 *  create endpoint allows past-today starts). */
function FreeCell({
  label,
  time,
  past,
  onPick
}: {
  label: string;
  time: string;
  past: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPick}
      className={`group relative z-10 h-12.5 rounded-[10px] border border-dashed border-creme/14 text-xs font-bold text-golden-light tabular-nums transition-colors hover:border-[1.5px] hover:border-golden hover:bg-golden/8 focus-visible:border-golden focus-visible:bg-golden/8 ${
        past ? 'opacity-45' : ''
      }`}
    >
      <span
        aria-hidden
        className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {time}
      </span>
    </button>
  );
}

/** Time staff have closed: hatched, with the reason for the desk to read. */
function ClosedCell({ span, reason }: { span: number; reason: string | null }) {
  return (
    <div
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
      className="relative z-10 flex h-12.5 min-w-0 flex-col justify-center rounded-[10px] border border-creme/22 bg-[repeating-linear-gradient(135deg,rgb(246_241_220/0.09)_0_6px,transparent_6px_12px)] px-3"
    >
      <span className="truncate text-[13px] font-bold">{m.admin_closed()}</span>
      {reason ? <span className="truncate text-xs text-grey-cool">{reason}</span> : null}
    </div>
  );
}

type RowCell =
  | { kind: 'booking'; minute: number; span: number; booking: BookingDto }
  | { kind: 'closed'; minute: number; span: number; reason: string | null }
  | { kind: 'free'; minute: number };

/** One spot's day, left to right: each booking and each closed stretch as a
 *  single cell spanning its half hours, every other half hour a cell of its
 *  own. `open`/`close` are whole hours, spans are counted in half hours. */
function rowCells(
  spotId: number,
  open: number,
  close: number,
  occupancy: Map<string, BookingDto>,
  closed: ClosedSpan[],
  hours: WeeklyHours
): RowCell[] {
  const gridEnd = close * 60;
  // Closures are whole hours
  const closureAt = (minute: number) =>
    closed.find(span => span.from * 60 <= minute && minute < span.to * 60);
  const cells: RowCell[] = [];
  for (let minute = open * 60; minute < gridEnd;) {
    const booking = occupancy.get(`${spotId}:${minute}`);
    const run = booking ? undefined : closureAt(minute);
    if (booking) {
      const end = bookingMinutes(booking, hours).end;
      // A booking can outlast the grid when staff have since moved closing
      // time earlier: clamp, or it would push every following row out of place
      const span = (Math.min(end, gridEnd) - minute) / SLOT_MINUTES;
      cells.push({ kind: 'booking', minute, span, booking });
      minute = end;
    } else if (run) {
      // Up to the end of the closure, the grid, or a booking, whichever comes first
      let end = minute + SLOT_MINUTES;
      while (end < gridEnd && closureAt(end) && !occupancy.has(`${spotId}:${end}`)) {
        end += SLOT_MINUTES;
      }
      cells.push({
        kind: 'closed',
        minute,
        span: (end - minute) / SLOT_MINUTES,
        reason: run.reason
      });
      minute = end;
    } else {
      cells.push({ kind: 'free', minute });
      minute += SLOT_MINUTES;
    }
  }
  return cells;
}

function blockTone(booking: BookingDto, now: number): BlockTone {
  if (Date.parse(booking.endsAt) <= now) return 'done';
  return Date.parse(booking.startsAt) <= now ? 'playing' : 'planned';
}

/** One spot's row: free half hours are buttons that seed a new booking; a
 *  booking renders as a single block spanning all of it, a closure as one too. */
function SpotRow({
  spot,
  open,
  close,
  occupancy,
  closed,
  now,
  nowMinute: clubNowMinute,
  weekHours,
  isPastDate,
  isToday,
  onPickSlot,
  onShowBooking
}: {
  spot: TableDto;
  open: number;
  close: number;
  occupancy: Map<string, BookingDto>;
  /** This spot's closed hours on the day: its own closures and the club's */
  closed: ClosedSpan[];
  now: number;
  /** Minutes into today as a club day (past 1440 on a late night) */
  nowMinute: number;
  weekHours: WeeklyHours;
  isPastDate: boolean;
  isToday: boolean;
  onPickSlot: (startMinute: number) => void;
  onShowBooking: (phone: string) => void;
}) {
  const nowMinute = isToday ? clubNowMinute : null;
  // Over: the whole half hour lies before now
  const isPastSlot = (minute: number) =>
    isPastDate || (nowMinute !== null && minute + SLOT_MINUTES <= nowMinute);
  const name = spotName(spot.kind, spot.label);

  const cells = rowCells(spot.id, open, close, occupancy, closed, weekHours).map(cell => {
    if (cell.kind === 'booking') {
      return (
        <BookingCell
          key={cell.minute}
          booking={cell.booking}
          span={cell.span}
          tone={blockTone(cell.booking, now)}
          onShowBooking={onShowBooking}
        />
      );
    }
    if (cell.kind === 'closed') {
      return <ClosedCell key={cell.minute} span={cell.span} reason={cell.reason} />;
    }
    return (
      <FreeCell
        key={cell.minute}
        label={`${name}, ${formatClock(cell.minute)} — ${m.admin_free()}`}
        time={formatClock(cell.minute)}
        past={isPastSlot(cell.minute)}
        onPick={() => onPickSlot(cell.minute)}
      />
    );
  });

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
  const { hours: weekHours } = useVenueConfig();
  const [date, setDate] = useState<IsoDate>(() => clubMoment(weekHours).date);
  const [prefill, setPrefill] = useState<NewBookingPrefill | null>(null);
  const [creating, setCreating] = useState(false);

  const {
    data: bookings,
    isPending,
    isError,
    error,
    refetch
  } = useQuery(adminBookingsQuery({ date, status: 'confirmed' }));
  // Rows come from the venue's real spots, so seeding a new dartboard shows up
  // here without a code change.
  const { data: spots = [] } = useQuery(tablesQuery());
  const { data: closures = [] } = useQuery(adminClosuresQuery());
  const [closing, setClosing] = useState<number | null>(null);

  // Same live signal the public wizard uses: any create/extend/cancel on this
  // date refreshes the grid instantly.
  useEffect(
    () =>
      availabilityLive.subscribe(date, changed => {
        queryClient.invalidateQueries({
          queryKey: adminBookingsQuery({ date: changed, status: 'confirmed' }).queryKey
        });
        // A closure set from another screen pings the same dates
        queryClient.invalidateQueries({ queryKey: adminClosuresQuery().queryKey });
      }),
    [date, queryClient]
  );

  const now = useNowMinute();
  // The club's today: past midnight on a late night, still the evening's grid
  const moment = clubMoment(weekHours, now);
  const today = moment.date;
  const isToday = date === today;
  const { open, close } = hoursForDate(date, weekHours);
  // What is closed today, said once above the grid: the hatching shows where
  const dayClosures = closures.flatMap(closure => {
    const span = closureSpanOn(closure, date);
    if (!span) return [];
    const from = Math.max(span.from, open);
    const to = Math.min(span.to, close);
    if (from >= to) return [];
    const where =
      closure.tableIds === null
        ? m.admin_closure_whole_club()
        : closure.tableIds
            .map(id => {
              const spot = spots.find(s => s.id === id);
              return spot ? spotName(spot.kind, spot.label) : String(id);
            })
            .join(', ');
    return [
      {
        id: closure.id,
        text: closedSpanText({ from, to }, { open, close }),
        where,
        reason: closure.reason
      }
    ];
  });
  const hours = Array.from({ length: Math.max(close - open, 0) }, (_, i) => open + i);
  // Two columns an hour: a booking may start and end on the half hour
  const slotsPerHour = 60 / SLOT_MINUTES;
  const occupancy = occupancyOf(bookings ?? [], weekHours);
  const nowMinute = moment.minute;

  // Where "now" falls across the opening hours, 0–1; only drawn on today's grid
  const nowFraction = (() => {
    if (!isToday || hours.length === 0) return null;
    const fraction = (nowMinute - open * 60) / ((close - open) * 60);
    return fraction > 0 && fraction < 1 ? fraction : null;
  })();

  const pickSlot = (tableId: number, startMinute: number) => {
    setPrefill({ date, startMinute, tableId });
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
        <AdminDatePicker value={date} onChange={next => setDate(next ?? today)} />
        <button
          type="button"
          onClick={() => setClosing(Date.now())}
          className="btn-outline flex h-10 items-center gap-2 border-creme/25 px-3.5 text-sm"
        >
          <Lock aria-hidden className="size-4" />
          {m.admin_closure_add()}
        </button>
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
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`${legendSwatch} border border-creme/22 bg-[repeating-linear-gradient(135deg,rgb(246_241_220/0.18)_0_3px,transparent_3px_6px)]`}
            />
            {m.admin_closed().toLocaleLowerCase(getLocale())}
          </li>
        </ul>
      </div>

      {dayClosures.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-2xl border border-golden/45 bg-club-green-dark px-4.5 py-3.5">
          {dayClosures.map(closure => (
            <li key={closure.id} className="flex items-start gap-3 text-[15px]">
              <Lock aria-hidden className="mt-1 size-4.5 flex-none text-golden" />
              <span>
                <strong>{closure.text}</strong>
                <span className="text-cream-soft">
                  {' '}
                  · {closure.where}
                  {closure.reason ? ` · ${closure.reason}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {isError && !bookings ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isPending || !bookings ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : (
        <div className="card overflow-x-auto px-4 pt-4.5 pb-5 md:px-5">
          <div
            className="relative grid min-w-max gap-1.5"
            style={{
              gridTemplateColumns: `110px repeat(${hours.length * slotsPerHour}, minmax(2.75rem, 1fr))`
            }}
          >
            <div className="sticky left-0 z-20 bg-card" />
            {hours.map(hour => (
              <div
                key={hour}
                style={{ gridColumn: `span ${slotsPerHour}` }}
                className={`pl-1 text-[13px] font-bold ${
                  isToday && hour === Math.floor(nowMinute / 60)
                    ? 'text-golden-light'
                    : 'text-grey-cool'
                }`}
              >
                {/* 24 is the hour after midnight on a late night: "00:00" */}
                {formatClock(hour * 60)}
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
                    closed={closedSpansOn(date, closures, spot.id)}
                    now={now}
                    nowMinute={nowMinute}
                    weekHours={weekHours}
                    isPastDate={date < today}
                    isToday={isToday}
                    onPickSlot={minute => pickSlot(spot.id, minute)}
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
                  {formatClock(nowMinute)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {closing !== null ? (
        <AdminClosureModal
          key={closing}
          closure={null}
          date={date}
          isOpen
          onOpenChange={isOpen => {
            if (!isOpen) setClosing(null);
          }}
          onShowBooking={onShowBooking}
        />
      ) : null}

      {prefill ? (
        <AdminBookingModal
          key={`${prefill.date}:${prefill.startMinute}:${prefill.tableId}`}
          isOpen={creating}
          onOpenChange={setCreating}
          prefill={prefill}
        />
      ) : null}
    </div>
  );
}
