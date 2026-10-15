import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { Clock } from 'lucide-react';
import {
  BOOKING_DAYS_AHEAD,
  MAX_BOOKING_HOURS,
  hoursForDate,
  isClosedAllDay,
  type AvailabilityDto,
  type IsoDate
} from '@repo/shared';
import { m } from '../../paraglide/messages.js';
import {
  addDays,
  dateTileParts,
  formatDayLong,
  formatHour,
  formatMonthYear,
  warsawToday
} from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { useLiveAvailability } from '../../lib/availability-live';
import { useVenueConfig } from '../../lib/venue-config';
import { QueryError } from '../QueryError';
import {
  goToStep,
  selectDate,
  selectDuration,
  selectStart,
  wizardStore
} from '../../store/booking-wizard';
import { StepActions } from './WizardFrame';

/** Hours at which at least one spot is free to start a booking. */
function freeHours(availability: AvailabilityDto): number[] {
  const hours: number[] = [];
  for (let hour = availability.open; hour <= availability.close - 1; hour++) {
    const anyFree = availability.tables.some(table =>
      table.slots.some(slot => slot.hour === hour && slot.available)
    );
    if (anyFree) hours.push(hour);
  }
  return hours;
}

/** Longest booking starting at `start` that at least one spot can host. */
function longestFrom(availability: AvailabilityDto, start: number): number {
  let best = 0;
  for (const table of availability.tables) {
    const free = new Set<number>();
    for (const slot of table.slots) if (slot.available) free.add(slot.hour);
    let run = 0;
    while (free.has(start + run)) run++;
    best = Math.max(best, run);
  }
  return Math.min(best, MAX_BOOKING_HOURS);
}

const sectionHead = 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2';
const sectionTitle = 'text-sm font-bold md:text-[15px]';

/**
 * Step 1, "when": the day, the start and the length on one screen. Each pick
 * lands in the store as it is made, so the summary beside it follows along;
 * a closed day is shown but cannot be picked.
 */
export function WhenStep() {
  const date = useStore(wizardStore, state => state.date);
  const { hours } = useVenueConfig();
  const today = warsawToday();
  const dates = Array.from({ length: BOOKING_DAYS_AHEAD }, (_, i) => addDays(today, i));

  return (
    <div>
      <h2 className="text-2xl font-bold md:text-[26px]">{m.step_when_title()}</h2>

      <div className={`mt-5.5 md:mt-7 ${sectionHead}`}>
        <h3 className={sectionTitle}>{m.date_label()}</h3>
        <span className="hidden text-sm text-grey-cool md:inline">
          {formatMonthYear(date ?? today)}
        </span>
      </div>
      <div
        role="group"
        aria-label={m.date_label()}
        className="-mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:mt-3 md:grid md:grid-cols-7 md:gap-2.5 md:overflow-visible md:px-0 md:pb-0"
      >
        {dates.map((day, index) => {
          const closed = isClosedAllDay(hoursForDate(day, hours));
          const parts = dateTileParts(day);
          const picked = day === date;
          let tag = parts.month;
          if (closed) tag = m.hours_closed();
          else if (index === 0) tag = m.hours_today();
          else if (index === 1) tag = m.date_tomorrow();
          return (
            <button
              key={day}
              type="button"
              aria-pressed={picked}
              aria-label={formatDayLong(day)}
              disabled={closed}
              onClick={() => selectDate(day)}
              className="chip h-20 w-16 flex-none flex-col gap-0.5 rounded-[14px] md:h-23 md:w-auto"
            >
              <span className="text-[11px] font-semibold capitalize opacity-85 md:text-xs">
                {parts.weekday}
              </span>
              <span className="text-[22px] leading-tight md:text-[26px]">{parts.day}</span>
              <span
                className={`text-[10px] lowercase md:text-[11px] ${
                  picked || closed
                    ? ''
                    : index <= 1
                      ? 'text-golden-light'
                      : 'font-semibold text-grey-cool'
                }`}
              >
                {tag}
              </span>
            </button>
          );
        })}
      </div>

      {date === null ? <TimeSkeleton /> : <TimePicker date={date} />}
    </div>
  );
}

function TimeSkeleton() {
  return (
    <div aria-hidden className="mt-7 md:mt-7.5">
      <div className="skeleton h-5 w-24" />
      <div className="mt-3 flex flex-wrap gap-2.5">
        {[0, 1, 2, 3, 4].map(n => (
          <div key={n} className="skeleton h-12.5 w-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function TimePicker({ date }: { date: IsoDate }) {
  useLiveAvailability(date);
  const {
    data: availability,
    isPending,
    isError,
    error,
    refetch
  } = useQuery(availabilityQuery(date));

  if (isError && !availability) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isPending || !availability) return <TimeSkeleton />;
  return <TimeOptions availability={availability} />;
}

function TimeOptions({ availability }: { availability: AvailabilityDto }) {
  const startHour = useStore(wizardStore, state => state.startHour);
  const durationHours = useStore(wizardStore, state => state.durationHours);

  const starts = freeHours(availability);
  // Live updates can take the picked hour away (someone else books it):
  // trust the fresh list, so the hour un-highlights and Next waits
  const start = startHour !== null && starts.includes(startHour) ? startHour : null;
  const longest = start === null ? MAX_BOOKING_HOURS : longestFrom(availability, start);
  const duration = Math.min(durationHours, Math.max(longest, 1));
  // Every length up to closing (or the cap) is listed; the ones no spot can
  // host from this start are shown but cannot be picked
  const span = Math.min(MAX_BOOKING_HOURS, availability.close - (start ?? availability.open));
  const lengths = Array.from({ length: Math.max(span, 1) }, (_, i) => i + 1);

  // …and when it shortens the longest stay from the picked start, the summary
  // beside the step must shrink with the highlighted length
  useEffect(() => {
    if (start !== null && duration !== durationHours) selectDuration(duration);
  }, [start, duration, durationHours]);

  const pickStart = (hour: number) => {
    selectStart(hour);
    const room = longestFrom(availability, hour);
    if (durationHours > room) selectDuration(Math.max(room, 1));
  };

  const next = () => {
    if (start === null) return;
    selectStart(start);
    selectDuration(duration);
    goToStep('table');
  };

  return (
    <>
      <div className={`mt-6.5 md:mt-7.5 ${sectionHead}`}>
        <h3 className={sectionTitle}>{m.time_start()}</h3>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-creme/8 px-2.5 py-1 text-xs text-cream-soft md:px-3 md:text-sm">
          <Clock aria-hidden className="size-3.5 text-golden" strokeWidth={2.2} />
          {m.when_open_hours({
            open: formatHour(availability.open),
            close: formatHour(availability.close)
          })}
        </span>
      </div>

      {starts.length === 0 ? (
        <p className="py-8 text-center text-grey-cool">{m.no_slots_for_date()}</p>
      ) : (
        <>
          <div
            role="group"
            aria-label={m.time_start()}
            className="mt-2.5 grid grid-cols-3 gap-2 md:mt-3 md:flex md:flex-wrap md:gap-2.5"
          >
            {starts.map(hour => (
              <button
                key={hour}
                type="button"
                aria-pressed={start === hour}
                onClick={() => pickStart(hour)}
                className="chip h-12.5 text-base tabular-nums md:w-24"
              >
                {formatHour(hour)}
              </button>
            ))}
          </div>

          <div className={`mt-6.5 md:mt-7.5 ${sectionHead}`}>
            <h3 className={sectionTitle}>{m.time_duration()}</h3>
            {start !== null && span < MAX_BOOKING_HOURS ? (
              <span className="text-sm text-grey-cool">
                {m.when_until_close({ time: formatHour(availability.close) })}
              </span>
            ) : null}
          </div>
          {/* One row of up to four; more go in two even rows, so a Saturday's
              eight still fit beside the summary */}
          <div
            role="group"
            aria-label={m.time_duration()}
            className={`mt-2.5 grid grid-cols-3 gap-1 rounded-[14px] bg-card p-1.25 sm:inline-grid md:mt-3 ${
              lengths.length > 6
                ? 'sm:grid-cols-4'
                : lengths.length > 4
                  ? 'sm:grid-cols-3'
                  : 'sm:grid-flow-col sm:grid-cols-none'
            }`}
          >
            {lengths.map(n => (
              <button
                key={n}
                type="button"
                aria-pressed={duration === n}
                disabled={n > longest}
                onClick={() => selectDuration(n)}
                className="segment h-11 px-5 text-[15px] sm:min-w-25"
              >
                {m.hours_n({ n })}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-grey-cool">{m.min_booking_note()}</p>
        </>
      )}

      <StepActions
        action={{
          label: m.next_to_table(),
          short: m.btn_next(),
          disabled: start === null,
          onPress: next
        }}
      />
    </>
  );
}
