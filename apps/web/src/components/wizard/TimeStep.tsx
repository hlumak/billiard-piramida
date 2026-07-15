import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import type { AvailabilityDto, IsoDate } from '@repo/shared';
import { m } from '../../paraglide/messages.js';
import { formatHour } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { useLiveAvailability } from '../../lib/availability-live';
import { fadeUpChild, m as motion, staggerParent, tapScale } from '../motion';
import { QueryError } from '../QueryError';
import { selectTime, wizardStore } from '../../store/booking-wizard';

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

/** Longest booking starting at `start` that at least one table can host. */
function maxDuration(availability: AvailabilityDto, start: number): number {
  let best = 0;
  for (const table of availability.tables) {
    const free = new Set<number>();
    for (const slot of table.slots) if (slot.available) free.add(slot.hour);
    let run = 0;
    while (free.has(start + run)) run++;
    best = Math.max(best, run);
  }
  return best;
}

const chip = (selected: boolean) =>
  `h-10 min-w-[64px] rounded-[10px] px-3 font-semibold transition-colors ${
    selected ? 'bg-golden text-btn-text' : 'bg-club-green-light text-creme hover:bg-surface-hover'
  }`;

export function TimeStep({ date }: { date: IsoDate }) {
  const storedStart = useStore(wizardStore, state => state.startHour);
  const storedDuration = useStore(wizardStore, state => state.durationHours);
  const [start, setStart] = useState<number | null>(storedStart);
  const [duration, setDuration] = useState(storedDuration);

  useLiveAvailability(date);
  const { data: availability, isPending, isError, refetch } = useQuery(availabilityQuery(date));

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !availability) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  const hours = freeHours(availability);
  const maxHours = start == null ? 0 : maxDuration(availability, start);
  const durations = Array.from({ length: maxHours }, (_, i) => i + 1);
  const effectiveDuration = Math.min(duration, Math.max(maxHours, 1));

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-creme">{m.step_time_title()}</h2>

      {hours.length === 0 ? (
        <p className="py-8 text-center text-grey-cool">{m.no_slots_for_date()}</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-grey-cool">{m.time_start()}</p>
          <motion.div
            className="flex flex-wrap gap-2"
            variants={staggerParent}
            initial="hidden"
            animate="visible"
          >
            {hours.map(hour => (
              <motion.button
                key={hour}
                type="button"
                variants={fadeUpChild}
                whileTap={tapScale}
                aria-pressed={start === hour}
                onClick={() => setStart(hour)}
                className={chip(start === hour)}
              >
                {formatHour(hour)}
              </motion.button>
            ))}
          </motion.div>

          {start != null ? (
            <>
              <p className="mb-2 mt-6 text-sm text-grey-cool">{m.time_duration()}</p>
              <motion.div
                className="flex flex-wrap gap-2"
                variants={staggerParent}
                initial="hidden"
                animate="visible"
              >
                {durations.map(hoursCount => (
                  <motion.button
                    key={hoursCount}
                    type="button"
                    variants={fadeUpChild}
                    whileTap={tapScale}
                    aria-pressed={effectiveDuration === hoursCount}
                    onClick={() => setDuration(hoursCount)}
                    className={chip(effectiveDuration === hoursCount)}
                  >
                    {m.hours_n({ n: hoursCount })}
                  </motion.button>
                ))}
              </motion.div>
              <p className="mt-3 text-xs text-grey-cool">{m.min_booking_note()}</p>
            </>
          ) : null}

          <Button
            size="lg"
            className="mt-8 h-[45px] w-full text-lg font-bold"
            isDisabled={start == null}
            onPress={() => {
              if (start != null) selectTime(start, effectiveDuration);
            }}
          >
            {m.btn_next()}
          </Button>
        </>
      )}
    </section>
  );
}
