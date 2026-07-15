import { Button, Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import type { IsoDate } from '@repo/shared';
import { m } from '../../paraglide/messages.js';
import { formatHour } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { useLiveAvailability } from '../../lib/availability-live';
import { QueryError } from '../QueryError';
import { goToStep, selectTable } from '../../store/booking-wizard';
import { FloorPlan } from './FloorPlan';

export function TableStep({
  date,
  startHour,
  durationHours
}: {
  date: IsoDate;
  startHour: number;
  durationHours: number;
}) {
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

  const freeTableIds = new Set(
    availability.tables
      .filter(table => {
        const free = new Set<number>();
        for (const slot of table.slots) if (slot.available) free.add(slot.hour);
        for (let hour = startHour; hour < startHour + durationHours; hour++) {
          if (!free.has(hour)) return false;
        }
        return true;
      })
      .map(table => table.tableId)
  );

  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold text-creme">{m.step_table_title()}</h2>
      <p className="mb-4 text-sm text-grey-cool">
        {formatHour(startHour)}–{formatHour(startHour + durationHours)}
      </p>

      <FloorPlan freeTableIds={freeTableIds} onSelect={selectTable} />

      {freeTableIds.size === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-4">
          <p className="text-center text-grey-cool">{m.no_tables_free()}</p>
          <Button
            variant="outline"
            className="border-golden text-creme"
            onPress={() => goToStep('time')}
          >
            {m.btn_back()}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
