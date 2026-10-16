import { BOOKING_DAYS_AHEAD, clubClosureOn, hoursForDate, weekdayOf } from '@repo/shared';
import { addDays, formatDay, formatHour, weekdayName } from '../../lib/format';
import { closedSpanLine, closedSpanText, hoursLeft } from '../../lib/closures';
import { clubMoment, groupWeeklyHours, useVenueConfig } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';

/** "понеділок" for one day, "понеділок – четвер" for a run. */
function dayRangeLabel(weekdays: number[]): string {
  const first = weekdays[0];
  const last = weekdays.at(-1);
  if (first === undefined || last === undefined) return '';
  return first === last ? weekdayName(first) : `${weekdayName(first)} – ${weekdayName(last)}`;
}

/**
 * Opening hours as rows, adjacent days with equal hours collapsed into one
 * ("Monday – Thursday 16:00–21:00"), the row that holds today highlighted and
 * tagged. Built from the live config, so a moved closing time shows at once.
 *
 * Closures staff set for the whole club show too: today's on today's row
 * (the usual hours struck through), the coming ones in a short list below.
 */
export function HoursList({ className }: { className?: string }) {
  const { hours, closures } = useVenueConfig();
  const todayDate = clubMoment(hours).date;
  const today = weekdayOf(todayDate);
  const todayHours = hoursForDate(todayDate, hours);
  const todayClosure = clubClosureOn(todayDate, hours, closures);
  const todayLeft = todayClosure ? hoursLeft(todayClosure, todayHours) : null;

  // The days ahead the wizard can book, so the list never runs on for months
  const changes = [];
  for (let i = 1; i < BOOKING_DAYS_AHEAD; i++) {
    const date = addDays(todayDate, i);
    const closure = clubClosureOn(date, hours, closures);
    if (!closure) continue;
    const day = hoursForDate(date, hours);
    changes.push({
      date,
      text: closure.spans.map(span => closedSpanText(span, day)).join(', ')
    });
  }

  return (
    <div className={className}>
      <dl className="flex flex-col gap-0.5 text-[15px]">
        {groupWeeklyHours(hours).map(group => {
          const isToday = group.weekdays.includes(today);
          const closure = isToday ? todayClosure : null;
          const usual = group.closed
            ? m.hours_closed()
            : `${formatHour(group.hours.open)}–${formatHour(group.hours.close)}`;
          return (
            // Inside a <dl> a wrapper <div> may hold only <dt> and <dd>: the
            // row's layout lives on it, and a closure note is one more <dd>
            <div
              key={group.weekdays.join('-')}
              className={`-mx-2.5 grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-[10px] px-2.5 py-2 ${isToday ? 'bg-golden/14' : ''}`}
            >
              {/* Flex centres the smaller tag on the day's line; on the baseline
                    it sat low. ::first-letter needs a block, hence inline-block. */}
              <dt
                className={`flex items-center gap-2 ${isToday ? 'font-semibold' : 'text-cream-soft'}`}
              >
                <span className="inline-block first-letter:uppercase">
                  {dayRangeLabel(group.weekdays)}
                </span>
                {isToday ? (
                  <span className="text-xs leading-none font-bold tracking-wide text-golden-light uppercase">
                    {m.hours_today()}
                  </span>
                ) : null}
              </dt>
              {/* A time range that wraps mid-dash reads as two times */}
              <dd className={`whitespace-nowrap tabular-nums ${isToday ? 'font-semibold' : ''}`}>
                {closure ? (
                  <>
                    <s className="font-medium text-cream-soft">{usual}</s>{' '}
                    {closure.allDay
                      ? m.hours_closed()
                      : todayLeft
                        ? `${formatHour(todayLeft.open)}–${formatHour(todayLeft.close)}`
                        : null}
                  </>
                ) : (
                  usual
                )}
              </dd>
              {closure
                ? closure.spans.map(span => (
                    <dd key={span.from} className="col-span-2 mt-1 text-[13px] text-golden-light">
                      {closedSpanLine(span, todayHours)}
                    </dd>
                  ))
                : null}
            </div>
          );
        })}
      </dl>

      {changes.length > 0 ? (
        <div className="mt-3.5 border-t border-creme/12 pt-3.5">
          <p className="text-xs font-bold tracking-[0.12em] text-grey-cool uppercase">
            {m.hours_changes()}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {changes.map(change => (
              <li key={change.date} className="flex justify-between gap-3">
                <span className="inline-block first-letter:uppercase">
                  {formatDay(change.date)}
                </span>
                <span className="text-right text-cream-soft">{change.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
