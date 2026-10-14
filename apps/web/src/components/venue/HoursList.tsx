import { weekdayOf } from '@repo/shared';
import { formatHour, warsawToday, weekdayName } from '../../lib/format';
import { groupWeeklyHours, useVenueConfig } from '../../lib/venue-config';
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
 */
export function HoursList({ className }: { className?: string }) {
  const { hours } = useVenueConfig();
  const today = weekdayOf(warsawToday());

  return (
    <dl className={`flex flex-col gap-0.5 text-[15px] ${className ?? ''}`}>
      {groupWeeklyHours(hours).map(group => {
        const isToday = group.weekdays.includes(today);
        return (
          <div
            key={group.weekdays.join('-')}
            className={`-mx-2.5 flex items-center justify-between gap-3 rounded-[10px] px-2.5 py-2 ${
              isToday ? 'bg-golden/14' : ''
            }`}
          >
            <dt
              className={`first-letter:uppercase ${isToday ? 'font-semibold' : 'text-cream-soft'}`}
            >
              {dayRangeLabel(group.weekdays)}
              {isToday ? (
                <span className="ml-2 text-xs font-bold uppercase tracking-wide text-golden-light">
                  {m.hours_today()}
                </span>
              ) : null}
            </dt>
            {/* A time range that wraps mid-dash reads as two times */}
            <dd className={`whitespace-nowrap tabular-nums ${isToday ? 'font-semibold' : ''}`}>
              {group.closed
                ? m.hours_closed()
                : `${formatHour(group.hours.open)}–${formatHour(group.hours.close)}`}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
