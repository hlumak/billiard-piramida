import { m as msg } from '../../paraglide/messages.js';
import { addDays, formatDay, warsawToday } from '../../lib/format';
import { fadeUpChild, m, staggerParent, tapScale } from '../motion';
import { selectDate } from '../../store/booking-wizard';

const DAYS_AHEAD = 14;

export function DateStep() {
  const today = warsawToday();
  const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-creme">{msg.step_date_title()}</h2>
      <m.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
        variants={staggerParent}
        initial="hidden"
        animate="visible"
      >
        {dates.map((date, i) => (
          <m.button
            key={date}
            type="button"
            variants={fadeUpChild}
            whileTap={tapScale}
            onClick={() => selectDate(date)}
            className="flex h-[52px] flex-col items-center justify-center rounded-[10px] bg-club-green-light text-creme transition-colors hover:bg-surface-hover"
          >
            <span className="font-medium capitalize">{formatDay(date)}</span>
            {i <= 1 ? (
              <span className="text-xs text-golden">
                {i === 0 ? msg.date_today() : msg.date_tomorrow()}
              </span>
            ) : null}
          </m.button>
        ))}
      </m.div>
    </section>
  );
}
