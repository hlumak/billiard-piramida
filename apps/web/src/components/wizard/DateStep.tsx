import { BOOKING_DAYS_AHEAD, hoursForDate, isClosedAllDay } from '@repo/shared';
import { m as msg } from '../../paraglide/messages.js';
import { addDays, formatDay, warsawToday } from '../../lib/format';
import { useVenueConfig } from '../../lib/venue-config';
import { selectDate } from '../../store/booking-wizard';

export function DateStep() {
  const today = warsawToday();
  const { hours } = useVenueConfig();
  const dates = Array.from({ length: BOOKING_DAYS_AHEAD }, (_, i) => addDays(today, i));

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-creme">{msg.step_date_title()}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {dates.map((date, i) => {
          // A day the club is shut has no slots: say so rather than lead there
          const closed = isClosedAllDay(hoursForDate(date, hours));
          return (
            <button
              key={date}
              type="button"
              disabled={closed}
              onClick={() => selectDate(date)}
              className="anim-stagger-item flex h-13 flex-col items-center justify-center rounded-[10px] bg-club-green-light text-creme transition enabled:hover:bg-surface-hover enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="font-medium capitalize">{formatDay(date)}</span>
              {closed ? (
                <span className="text-xs text-grey-cool">{msg.hours_closed()}</span>
              ) : i <= 1 ? (
                <span className="text-xs text-golden">
                  {i === 0 ? msg.date_today() : msg.date_tomorrow()}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
