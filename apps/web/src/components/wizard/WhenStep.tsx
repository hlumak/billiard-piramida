import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { Clock, Lock } from 'lucide-react';
import {
  BOOKING_DAYS_AHEAD,
  MAX_BOOKING_HOURS,
  closedSpansOn,
  clubClosureOn,
  hoursForDate,
  isClosedAllDay,
  type AvailabilityDto,
  type ClosedSpan,
  type DayHours,
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
import { closedSpanLine, closedSpanText, partlyClosedTag } from '../../lib/closures';
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

/**
 * Hours staff have closed for the whole club: every spot's slot is closed.
 * Read off the live grid rather than the venue config, which a guest's tab
 * may hold for a while — the grid is refreshed the moment a closure is set.
 */
function clubClosedHours(availability: AvailabilityDto): number[] {
  const hours: number[] = [];
  if (availability.tables.length === 0) return hours;
  for (let hour = availability.open; hour <= availability.close - 1; hour++) {
    const closed = availability.tables.every(table =>
      table.slots.some(slot => slot.hour === hour && slot.closed)
    );
    if (closed) hours.push(hour);
  }
  return hours;
}

/** Runs of consecutive hours as spans, each with the reason staff gave for it. */
function closedRuns(hours: number[], reasons: readonly ClosedSpan[]): ClosedSpan[] {
  const runs: ClosedSpan[] = [];
  for (const hour of hours) {
    const last = runs.at(-1);
    if (last && last.to === hour) last.to = hour + 1;
    else runs.push({ from: hour, to: hour + 1, reason: null });
  }
  for (const run of runs) {
    run.reason = reasons.find(span => span.from < run.to && span.to > run.from)?.reason ?? null;
  }
  return runs;
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

/**
 * What cuts the stay short from the picked start: the closure it runs into,
 * or closing time when that comes before the longest booking allowed.
 */
function durationHint(
  stopRun: ClosedSpan | undefined,
  start: number | null,
  span: number,
  day: DayHours
): string | null {
  if (stopRun) return closedSpanText(stopRun, day);
  if (start !== null && span < MAX_BOOKING_HOURS) {
    return m.when_until_close({ time: formatHour(day.close) });
  }
  return null;
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
  const { hours, closures } = useVenueConfig();
  const today = warsawToday();
  const dates = Array.from({ length: BOOKING_DAYS_AHEAD }, (_, i) => addDays(today, i));
  // Shut by the weekly hours, or for the whole day by staff
  const isShut = (day: IsoDate) =>
    isClosedAllDay(hoursForDate(day, hours)) ||
    clubClosureOn(day, hours, closures)?.allDay === true;
  // No day to open on (a closure longer than the window): say so, rather than
  // leave the hours placeholder waiting for a pick that cannot come
  const allClosed = dates.every(isShut);

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
          const closed = isShut(day);
          const closure = closed ? null : clubClosureOn(day, hours, closures);
          const parts = dateTileParts(day);
          const picked = day === date;
          let tag = parts.month;
          if (closed) tag = m.hours_closed();
          // A part-closed day says so before it says "today": it is what
          // changes the guest's plan
          else if (closure) tag = partlyClosedTag(closure, hoursForDate(day, hours));
          else if (index === 0) tag = m.hours_today();
          else if (index === 1) tag = m.date_tomorrow();
          // Named by its own words ("czw 15 jutro") with the full date after
          // them for a screen reader, so a voice command naming what is on
          // the tile finds it
          return (
            <button
              key={day}
              type="button"
              aria-pressed={picked}
              disabled={closed}
              onClick={() => selectDate(day)}
              // relative: the screen-reader date inside is positioned, and would
              // otherwise escape the scrolling row and widen the whole page
              className="chip relative h-20 w-16 flex-none flex-col gap-0.5 rounded-[14px] md:h-23 md:w-auto"
            >
              <span className="text-[11px] font-semibold capitalize opacity-85 md:text-xs">
                {parts.weekday}
              </span>{' '}
              <span className="text-[22px] leading-tight md:text-[26px]">{parts.day}</span>{' '}
              <span
                className={`text-[10px] lowercase md:text-[11px] ${
                  picked || closed
                    ? ''
                    : index <= 1 || closure
                      ? 'text-golden-light'
                      : 'font-semibold text-grey-cool'
                }`}
              >
                {tag}
              </span>
              <span className="sr-only">, {formatDayLong(day)}</span>
            </button>
          );
        })}
      </div>

      {date !== null ? (
        <TimePicker date={date} />
      ) : allClosed ? (
        <p className="py-8 text-center text-grey-cool">{m.when_all_closed()}</p>
      ) : (
        <TimeSkeleton />
      )}
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
  // Another day keeps the last day's hours on screen (dimmed, not pickable)
  // until its own arrive: swapping them for the skeleton collapsed the step
  // and unmounted its actions, so the page jumped and the bar re-animated
  const {
    data: availability,
    isPending,
    isPlaceholderData,
    isError,
    error,
    refetch
  } = useQuery({ ...availabilityQuery(date), placeholderData: keepPreviousData });

  if (isError && !availability) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isPending || !availability) return <TimeSkeleton />;
  return <TimeOptions availability={availability} loading={isPlaceholderData} />;
}

/** The hours a stay can start at; closed ones struck through, their reasons below. */
function StartHours({
  hours,
  closedHours,
  closedLines,
  picked,
  onPick
}: {
  hours: number[];
  closedHours: number[];
  closedLines: string[];
  picked: number | null;
  onPick: (hour: number) => void;
}) {
  return (
    <>
      <div
        role="group"
        aria-label={m.time_start()}
        className="mt-2.5 grid grid-cols-3 gap-2 md:mt-3 md:flex md:flex-wrap md:gap-2.5"
      >
        {hours.map(hour => {
          const closed = closedHours.includes(hour);
          return (
            <button
              key={hour}
              type="button"
              aria-pressed={picked === hour}
              disabled={closed}
              aria-label={closed ? `${formatHour(hour)}, ${m.hours_closed()}` : undefined}
              onClick={() => onPick(hour)}
              className="chip h-12.5 text-base tabular-nums disabled:line-through md:w-24"
            >
              {formatHour(hour)}
            </button>
          );
        })}
      </div>
      {closedLines.length > 0 ? (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-[14px] border border-golden/35 bg-golden/10 px-3.5 py-3 text-sm">
          <Lock aria-hidden className="mt-0.5 size-4 flex-none text-golden" strokeWidth={2.2} />
          <p>
            {closedLines.map(line => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </>
  );
}

/** How long to stay; lengths no spot can host from the picked start are shown but not pickable. */
function DurationOptions({
  lengths,
  picked,
  longest,
  hint
}: {
  lengths: number[];
  picked: number;
  longest: number;
  hint: string | null;
}) {
  // Across the full width: one row of up to four; more go in two even rows,
  // so a Saturday's eight still fit beside the summary
  let columns = 'sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none';
  if (lengths.length > 6) columns = 'sm:grid-cols-4';
  else if (lengths.length > 4) columns = 'sm:grid-cols-3';
  return (
    <>
      <div className={`mt-6.5 md:mt-7.5 ${sectionHead}`}>
        <h3 className={sectionTitle}>{m.time_duration()}</h3>
        {hint ? <span className="text-sm text-grey-cool">{hint}</span> : null}
      </div>
      <div
        role="group"
        aria-label={m.time_duration()}
        className={`mt-2.5 grid grid-cols-3 gap-1 rounded-[14px] bg-card p-1.25 md:mt-3 ${columns}`}
      >
        {lengths.map(n => (
          <button
            key={n}
            type="button"
            aria-pressed={picked === n}
            disabled={n > longest}
            onClick={() => selectDuration(n)}
            className="segment h-11 px-5 text-[15px]"
          >
            {m.hours_n({ n })}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-grey-cool">{m.min_booking_note()}</p>
    </>
  );
}

function TimeOptions({
  availability,
  loading
}: {
  availability: AvailabilityDto;
  /** The hours are still the previous day's */
  loading: boolean;
}) {
  const startHour = useStore(wizardStore, state => state.startHour);
  const durationHours = useStore(wizardStore, state => state.durationHours);

  const { closures } = useVenueConfig();
  const starts = freeHours(availability);
  // Closed hours stay in the list, struck through, with the reason under it:
  // hours that vanish read as "all booked", not "closed for an event"
  const closedHours = clubClosedHours(availability);
  const shownHours = [...new Set([...starts, ...closedHours])].sort((a, b) => a - b);
  const day = { open: availability.open, close: availability.close };
  const runs = closedRuns(closedHours, closedSpansOn(availability.date, closures));
  const closedLines = runs.map(run => closedSpanLine(run, day));
  // Live updates can take the picked hour away (someone else books it):
  // trust the fresh list, so the hour un-highlights and Next waits
  const start = startHour !== null && starts.includes(startHour) ? startHour : null;
  const longest = start === null ? MAX_BOOKING_HOURS : longestFrom(availability, start);
  const duration = Math.min(durationHours, Math.max(longest, 1));
  // The closure that cuts the stay short, if one does
  const stopRun = start === null ? undefined : runs.find(run => run.from === start + longest);
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
      <div
        aria-busy={loading}
        inert={loading}
        className={`transition-opacity duration-200 ${loading ? 'opacity-50' : ''}`}
      >
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

        {shownHours.length === 0 ? (
          <p className="py-8 text-center text-grey-cool">{m.no_slots_for_date()}</p>
        ) : (
          <>
            <StartHours
              hours={shownHours}
              closedHours={closedHours}
              closedLines={closedLines}
              picked={start}
              onPick={pickStart}
            />

            {/* Only closed hours left: nothing to measure a stay from */}
            {starts.length > 0 ? (
              <DurationOptions
                lengths={lengths}
                picked={duration}
                longest={longest}
                hint={durationHint(stopRun, start, span, day)}
              />
            ) : null}
          </>
        )}
      </div>

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
