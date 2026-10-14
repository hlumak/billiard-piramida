import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  addDays,
  hoursForDate,
  isClosedAllDay,
  type AvailabilityDto,
  type IsoDate
} from '@repo/shared';
import { isRateLimited } from '../../lib/api';
import { useLiveAvailability } from '../../lib/availability-live';
import { formatHour, warsawHour, warsawToday } from '../../lib/format';
import { useIsHydrated } from '../../lib/hydration';
import { availabilityQuery } from '../../lib/queries';
import { useNowMinute } from '../../lib/use-now';
import { useVenueConfig } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';

interface HourFree {
  hour: number;
  free: number;
}

/**
 * Billiard tables free at each start hour still ahead. An hour where no table
 * is either free or booked is in the past (the API marks those unavailable),
 * and drops out; darts are not tables, so they do not count.
 */
function freeByHour(availability: AvailabilityDto): HourFree[] {
  const tables = availability.tables.filter(table => table.kind === 'billiard');
  const result: HourFree[] = [];
  for (let hour = availability.open; hour < availability.close; hour++) {
    const slots = tables.flatMap(table => table.slots.filter(slot => slot.hour === hour));
    if (slots.every(slot => !slot.available && !slot.booked)) continue;
    result.push({ hour, free: slots.filter(slot => slot.available).length });
  }
  return result;
}

/** Today, unless the club is shut today or past its last start hour: then tomorrow. */
function useShownDate(): { date: IsoDate; tomorrow: boolean } {
  const { hours } = useVenueConfig();
  // Ticks every minute, so a page left open rolls over to tomorrow on its own
  const now = useNowMinute();
  const today = warsawToday(now);
  const todays = hoursForDate(today, hours);
  const over = isClosedAllDay(todays) || warsawHour(now) >= todays.close - 1;
  return over ? { date: addDays(today, 1), tomorrow: true } : { date: today, tomorrow: false };
}

function Chips({ date }: { date: IsoDate }) {
  useLiveAvailability(date);
  const { data, isPending, isError, error, refetch } = useQuery(availabilityQuery(date));

  // Said, not hidden: an empty strip reads as "no free tables" or a broken page
  if (isError) {
    return (
      <p role="alert" className="py-4 text-sm text-cream-soft">
        {isRateLimited(error) ? m.err_rate_limited() : m.err_generic()}{' '}
        <button
          type="button"
          onClick={() => void refetch()}
          className="font-semibold text-golden-light underline-offset-2 hover:underline"
        >
          {m.btn_retry()}
        </button>
      </p>
    );
  }
  if (isPending) {
    return (
      <>
        {[0, 1, 2, 3, 4].map(i => (
          <span
            key={i}
            aria-hidden
            className="skeleton h-15.5 w-21.5 shrink-0 rounded-[14px] lg:w-auto lg:flex-1"
          />
        ))}
      </>
    );
  }

  const hours = freeByHour(data);
  if (hours.length === 0 || hours.every(entry => entry.free === 0)) {
    return <p className="py-4 text-sm text-cream-soft">{m.home_free_none()}</p>;
  }

  return (
    <>
      {hours.map(({ hour, free }) =>
        free === 0 ? (
          <span
            key={hour}
            className="flex h-15.5 w-21.5 shrink-0 flex-col items-center justify-center rounded-[14px] text-creme/45 shadow-[inset_0_0_0_1.5px_rgb(246_241_220/0.22)] lg:w-auto lg:flex-1"
          >
            <span className="text-[17px] font-bold lg:text-lg">{formatHour(hour)}</span>
            <span className="text-[11px] font-semibold lg:text-xs">{m.hours_busy()}</span>
          </span>
        ) : (
          <Link
            key={hour}
            to="/book"
            search={{ date, start: hour }}
            aria-label={`${m.home_free_book_at({ time: formatHour(hour) })}, ${m.free_n({ n: free })}`}
            className="chip anim-stagger-item h-15.5 w-21.5 shrink-0 flex-col rounded-[14px] hover:-translate-y-0.5 lg:w-auto lg:flex-1"
          >
            <span className="text-[17px] lg:text-lg">{formatHour(hour)}</span>
            <span className="text-[11px] font-semibold text-golden-light lg:text-xs">
              {m.free_n({ n: free })}
            </span>
          </Link>
        )
      )}
    </>
  );
}

/**
 * "Free tables today": every start hour left today with how many tables are
 * still free, live (the same WebSocket the booking wizard listens to). An hour
 * goes straight to the table step with the date and time already picked.
 * Client-only: what "today" and "now" are is the visitor's moment, not the
 * server render's.
 */
export function FreeTables({ className }: { className?: string }) {
  const hydrated = useIsHydrated();
  const { date, tomorrow } = useShownDate();
  const titleId = 'free-tables-title';

  return (
    <section
      aria-labelledby={titleId}
      className={`rounded-[22px] border border-line bg-card py-5 pl-5 lg:flex lg:items-center lg:gap-7 lg:rounded-[20px] lg:border-creme/16 lg:bg-club-green-deepest/85 lg:px-6 lg:backdrop-blur-sm ${className ?? ''}`}
    >
      <div className="flex items-baseline justify-between gap-3 pr-5 lg:block lg:w-55 lg:shrink-0 lg:pr-0">
        <h2 id={titleId} className="text-[17px] font-bold">
          {tomorrow ? m.home_free_tomorrow() : m.home_free_today()}
        </h2>
        <Link to="/book" className="text-[13px] font-bold text-golden-light lg:hidden">
          {m.home_free_more()} →
        </Link>
        <p className="mt-1 hidden text-[13px] leading-snug text-grey-cool lg:block">
          {m.home_free_hint()}
        </p>
      </div>
      <p className="mt-1 pr-5 text-[13px] text-grey-cool lg:hidden">{m.home_free_hint()}</p>
      <div className="mt-3.5 flex gap-2 overflow-x-auto pr-5 [scrollbar-width:none] lg:mt-0 lg:flex-1 lg:gap-2.5 lg:overflow-visible lg:pr-0">
        {hydrated ? <Chips date={date} /> : null}
      </div>
      <Link
        to="/book"
        className="hidden shrink-0 text-sm font-bold text-golden-light transition-colors hover:text-golden lg:block"
      >
        {m.home_free_more()} →
      </Link>
    </section>
  );
}
