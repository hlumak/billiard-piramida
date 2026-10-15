import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import {
  formatPln,
  type AdminTopItemDto,
  type BookingDto,
  type MenuItemDto,
  type TableDto
} from '@repo/shared';
import { formatPhone } from '@repo/shared/phone';
import { adminBookingsQuery, adminStatsQuery } from '../../lib/admin-api';
import { intlTag, warsawTime, warsawToday } from '../../lib/format';
import { menuQuery, tablesQuery } from '../../lib/queries';
import { spotDescription, spotName } from '../../lib/spots';
import { useNowMinute } from '../../lib/use-now';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { PHASE_LABELS, PHASE_STYLES } from '../booking/phase';
import { QueryError } from '../QueryError';
import { AdminEditBooking } from './AdminBookingModal';
import { AdminBookingOrder } from './AdminBookingOrder';
import type { AdminPaneId } from './panes';

const MINUTE = 60_000;
/** A booking this close to its start reads as "soon" rather than "later" */
const SOON_MINUTES = 60;

/** "40 хв", "1 год", "1 год 40": a stretch of time as the desk says it. */
function duration(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  if (whole < 60) return m.dur_min({ n: whole });
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? m.dur_h({ h: hours }) : m.dur_h_min({ h: hours, m: rest });
}

type Tone = 'playing' | 'soon' | 'later' | 'done';

const TONES: Record<Tone, string> = {
  playing: PHASE_STYLES.active,
  soon: 'border border-golden/70 text-golden',
  later: 'bg-creme/10 text-cream-soft',
  done: 'bg-creme/8 text-grey-cool'
};

/**
 * Where a confirmed booking stands right now, read off the clock rather than
 * the fetched phase: the list refetches every minute, the status line should
 * not lag behind it.
 */
function liveStatus(booking: BookingDto, now: number): { tone: Tone; label: string } {
  const start = Date.parse(booking.startsAt);
  const end = Date.parse(booking.endsAt);
  if (now >= end) return { tone: 'done', label: PHASE_LABELS.finished() };
  if (now >= start) {
    return {
      tone: 'playing',
      label: m.admin_playing_for({ left: duration((end - now) / MINUTE) })
    };
  }
  const until = (start - now) / MINUTE;
  return until <= SOON_MINUTES
    ? { tone: 'soon', label: m.admin_starts_in({ time: duration(until) }) }
    : { tone: 'later', label: PHASE_LABELS.upcoming() };
}

function Kpi({
  label,
  value,
  note,
  highlight = false,
  money = false,
  className = ''
}: {
  label: string;
  value: string;
  note?: string | undefined;
  highlight?: boolean;
  money?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`anim-stagger-item rounded-2xl p-3.5 md:rounded-[18px] md:p-5 ${
        highlight ? 'bg-golden text-btn-text' : 'card'
      } ${className}`}
    >
      <p className={`text-xs md:text-[13px] ${highlight ? 'font-semibold' : 'text-grey-cool'}`}>
        {label}
      </p>
      <p
        className={`mt-1.5 text-[26px] leading-none font-bold tabular-nums md:mt-2 md:text-[32px] ${
          money ? 'text-golden' : ''
        }`}
      >
        {value}
      </p>
      {note ? (
        <p
          className={`mt-2 hidden text-xs leading-snug md:block ${highlight ? 'font-semibold' : 'text-grey-cool'}`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A finished booking is dimmed but keeps its actions: the tab is often
 * settled at the bar after the game ends, and a dialog opened just before
 * the end must not vanish with its row's buttons.
 */
function TodayRow({ booking, now }: { booking: BookingDto; now: number }) {
  const status = liveStatus(booking, now);
  const time = `${warsawTime(booking.startsAt)}–${warsawTime(booking.endsAt)}`;
  // On each part rather than on the wrapper, which is display: contents on a wide screen
  const dim = status.tone === 'done' ? 'opacity-55' : '';
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-t border-line px-4 py-3.5 md:px-5.5 lg:grid-cols-[118px_minmax(0,1fr)_132px_auto] lg:gap-x-4">
      <div className="min-w-0 lg:contents">
        <p className={`font-bold tabular-nums lg:col-start-1 lg:row-start-1 ${dim}`}>
          {time}
          <span className="font-semibold lg:hidden">
            {' '}
            · {spotName(booking.kind, booking.tableLabel)}
          </span>
        </p>
        <p
          className={`hidden text-[13px] text-grey-cool lg:col-start-1 lg:row-start-2 lg:block ${dim}`}
        >
          {spotDescription(booking.kind, booking.tableLabel, {
            game: booking.game,
            lowercaseGame: true
          })}
        </p>
        <p
          className={`mt-0.5 min-w-0 truncate text-[13px] text-grey-cool lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:text-base ${dim}`}
        >
          <span className="font-semibold lg:block lg:text-[15px] lg:text-creme">
            {booking.customerName}
          </span>
          <span className="lg:hidden"> · </span>
          <a
            href={`tel:${booking.customerPhone}`}
            className="text-golden-light underline decoration-golden-light/45 underline-offset-2 hover:decoration-golden-light lg:text-[13px]"
          >
            {formatPhone(booking.customerPhone)}
          </a>
        </p>
      </div>
      <span
        className={`rounded-full px-2.5 py-1 text-center text-xs font-bold whitespace-nowrap lg:col-start-3 lg:row-span-2 lg:row-start-1 ${TONES[status.tone]} ${dim}`}
      >
        {status.label}
      </span>
      <div className="col-span-2 flex gap-2 lg:col-span-1 lg:col-start-4 lg:row-span-2 lg:row-start-1 lg:justify-end">
        <AdminBookingOrder booking={booking} />
        <AdminEditBooking booking={booking} />
      </div>
    </li>
  );
}

type TileState =
  | { kind: 'playing'; until: string }
  | { kind: 'soon'; at: string }
  | { kind: 'free' };

function tileState(spot: TableDto, bookings: BookingDto[], now: number): TileState {
  const own = bookings.filter(booking => booking.tableId === spot.id);
  const playing = own.find(
    booking => Date.parse(booking.startsAt) <= now && now < Date.parse(booking.endsAt)
  );
  if (playing) return { kind: 'playing', until: warsawTime(playing.endsAt) };
  const next = own.find(booking => {
    const until = (Date.parse(booking.startsAt) - now) / MINUTE;
    return until > 0 && until <= SOON_MINUTES;
  });
  return next ? { kind: 'soon', at: warsawTime(next.startsAt) } : { kind: 'free' };
}

/** Every table and dartboard as a tile: playing (until when), about to start, or free. */
function TablesNow({
  spots,
  bookings,
  now
}: {
  spots: TableDto[];
  bookings: BookingDto[];
  now: number;
}) {
  const ordered = [...spots].sort(
    (a, b) =>
      Number(a.kind === 'darts') - Number(b.kind === 'darts') || Number(a.label) - Number(b.label)
  );
  return (
    <section className="card anim-stagger-item p-4.5 md:px-5.5 md:py-5">
      <h2 className="text-lg font-bold">{m.admin_tables_now()}</h2>
      <ul className="mt-3.5 grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-4">
        {ordered.map(spot => {
          const state = tileState(spot, bookings, now);
          const label =
            spot.kind === 'darts' ? m.admin_dartboard_short({ n: spot.label }) : spot.label;
          let note = m.admin_tile_free();
          let look = 'border-[1.5px] border-creme/25';
          if (state.kind === 'playing') {
            note = m.admin_tile_until({ time: state.until });
            look = 'bg-golden text-btn-text';
          } else if (state.kind === 'soon') {
            note = m.admin_tile_at({ time: state.at });
            look = 'border-[1.5px] border-dashed border-golden';
          }
          return (
            <li
              key={spot.id}
              aria-label={`${spotName(spot.kind, spot.label)}: ${note}`}
              className={`flex h-13 flex-col items-center justify-center rounded-xl text-[15px] font-bold ${look}`}
            >
              <span aria-hidden>{label}</span>
              <span
                aria-hidden
                className={`text-[10px] ${
                  state.kind === 'playing'
                    ? 'font-bold'
                    : state.kind === 'soon'
                      ? 'font-semibold text-golden-light'
                      : 'font-semibold text-grey-cool'
                }`}
              >
                {note}
              </span>
            </li>
          );
        })}
      </ul>
      <ul aria-hidden className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-grey-cool">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[3px] bg-golden" />
          {m.admin_legend_playing()}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[3px] border-[1.5px] border-dashed border-golden" />
          {m.admin_legend_soon()}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[3px] border-[1.5px] border-creme/40" />
          {m.admin_tile_free()}
        </li>
      </ul>
    </section>
  );
}

/** Today's confirmed bookings in start order, each with where it stands right now. */
function TodayBookings({
  bookings,
  failed,
  error,
  onRetry,
  now,
  onOpenSchedule
}: {
  /** Undefined until the day's bookings have loaded */
  bookings: BookingDto[] | undefined;
  failed: boolean;
  error: unknown;
  onRetry: () => void;
  now: number;
  onOpenSchedule: () => void;
}) {
  let body;
  if (bookings === undefined && failed) {
    body = (
      <div className="border-t border-line">
        <QueryError error={error} onRetry={onRetry} />
      </div>
    );
  } else if (bookings === undefined) {
    body = (
      <div className="flex justify-center border-t border-line py-10">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  } else if (bookings.length === 0) {
    body = (
      <p className="border-t border-line px-5.5 py-8 text-grey-cool">{m.admin_today_empty()}</p>
    );
  } else {
    body = (
      <ul>
        {bookings.map(booking => (
          <TodayRow key={booking.id} booking={booking} now={now} />
        ))}
      </ul>
    );
  }
  return (
    <section className="card anim-stagger-item overflow-hidden">
      <div className="flex items-center justify-between px-4 py-4 md:px-5.5 md:py-5">
        <h2 className="text-lg font-bold">{m.admin_today()}</h2>
        <button
          type="button"
          onClick={onOpenSchedule}
          className="text-sm font-semibold text-golden-light hover:text-golden"
        >
          {m.admin_schedule_link()} →
        </button>
      </div>
      {body}
    </section>
  );
}

/** What sold best at the bar over the last 30 days, as bars against the best seller. */
function TopBarItems({
  items,
  menu
}: {
  items: AdminTopItemDto[];
  menu: MenuItemDto[] | undefined;
}) {
  const nameBySlug = new Map(menu?.map(item => [item.slug, item.name]));
  const topMax = Math.max(1, ...items.map(item => item.totalQuantity));
  return (
    <section className="card anim-stagger-item p-4.5 md:px-5.5 md:py-5">
      <h2 className="text-lg font-bold">{m.admin_top_bar()}</h2>
      <p className="mt-0.5 text-[13px] text-grey-cool">{m.admin_last_30()}</p>
      {items.length === 0 ? (
        <p className="mt-3.5 text-sm text-grey-cool">{m.admin_no_results()}</p>
      ) : (
        <ul className="mt-3.5 flex flex-col gap-3 text-sm">
          {items.map(item => (
            <li key={item.foodItemId}>
              <div className="flex justify-between gap-3">
                <span>{nameBySlug.get(item.slug) ?? item.slug}</span>
                <span className="font-bold text-golden-light tabular-nums">
                  × {item.totalQuantity}
                </span>
              </div>
              <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-creme/12">
                <div
                  className="anim-bar-fill h-full rounded-full bg-golden"
                  style={{ width: `${(item.totalQuantity / topMax) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The desk's first screen: today in numbers, today's bookings with what each
 * is doing right now, every table at a glance, and what sells at the bar.
 */
export function AdminOverview({ onOpen }: { onOpen: (pane: AdminPaneId) => void }) {
  const now = useNowMinute();
  const today = warsawToday(now);
  const { data: stats, isPending, isError, error, refetch } = useQuery(adminStatsQuery());
  // The same query the schedule makes, so the two share one cache entry
  const {
    data: dayBookings,
    isError: dayFailed,
    error: dayError,
    refetch: refetchDay
  } = useQuery(adminBookingsQuery({ date: today, status: 'confirmed' }));
  const { data: spots } = useQuery(tablesQuery());
  const { data: menu } = useQuery(menuQuery(getLocale()));

  if (isError && !stats) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isPending || !stats) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  const money = (grosz: number) => formatPln(grosz, intlTag());
  const confirmed = [...(dayBookings ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const playing = confirmed.filter(
    booking => Date.parse(booking.startsAt) <= now && now < Date.parse(booking.endsAt)
  );
  const ahead = confirmed.filter(booking => Date.parse(booking.startsAt) > now);
  const darts = confirmed.filter(booking => booking.kind === 'darts').length;
  const loaded = dayBookings !== undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
        <Kpi
          label={m.admin_today_bookings()}
          value={String(loaded ? confirmed.length : stats.todayBookings)}
          note={
            loaded ? m.admin_kpi_split({ billiard: confirmed.length - darts, darts }) : undefined
          }
        />
        <Kpi
          highlight
          label={m.admin_active_now()}
          value={String(loaded ? playing.length : stats.activeNow)}
          note={playing.map(booking => spotName(booking.kind, booking.tableLabel)).join(' · ')}
        />
        <Kpi
          label={m.admin_upcoming_today()}
          value={String(loaded ? ahead.length : stats.upcomingToday)}
          note={ahead[0] ? m.admin_kpi_next({ time: warsawTime(ahead[0].startsAt) }) : undefined}
        />
        <Kpi money label={m.admin_revenue_today()} value={money(stats.todayRevenueGrosz)} />
        <Kpi
          money
          label={m.admin_revenue_week()}
          value={money(stats.weekRevenueGrosz)}
          className="hidden md:block"
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TodayBookings
          bookings={loaded ? confirmed : undefined}
          failed={dayFailed}
          error={dayError}
          onRetry={() => refetchDay()}
          now={now}
          onOpenSchedule={() => onOpen('schedule')}
        />

        <div className="flex flex-col gap-5">
          {/* Only with today's bookings in: without them every table would read free */}
          {spots && loaded ? <TablesNow spots={spots} bookings={confirmed} now={now} /> : null}
          <TopBarItems items={stats.topItems} menu={menu} />
        </div>
      </div>
    </div>
  );
}
