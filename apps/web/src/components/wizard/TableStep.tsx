import { Button, Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ActivityKind, IsoDate } from '@repo/shared';
import { m } from '../../paraglide/messages.js';
import { formatHour } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { useLiveAvailability } from '../../lib/availability-live';
import { ACTIVITY_KINDS, activityName, spotName } from '../../lib/spots';
import { QueryError } from '../QueryError';
import { goToStep, selectTable } from '../../store/booking-wizard';
import { FloorPlan } from './FloorPlan';

const KIND_ICON: Record<ActivityKind, string> = { billiard: '🎱', darts: '🎯' };

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
  const [kind, setKind] = useState<ActivityKind>('billiard');

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !availability) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  // Free = every hour of the chosen window is available on that spot
  const freeTableIds = new Set<number>();
  for (const table of availability.tables) {
    const free = new Set<number>();
    for (const slot of table.slots) if (slot.available) free.add(slot.hour);
    let wholeWindowFree = true;
    for (let hour = startHour; hour < startHour + durationHours; hour++) {
      if (!free.has(hour)) {
        wholeWindowFree = false;
        break;
      }
    }
    if (wholeWindowFree) freeTableIds.add(table.tableId);
  }

  const spots = availability.tables.map(t => ({ id: t.tableId, label: t.label, kind: t.kind }));
  const ofKind = availability.tables.filter(table => table.kind === kind);
  const freeOfKind = ofKind.filter(table => freeTableIds.has(table.tableId));
  const roomIsBusy = freeTableIds.size === 0;
  // Only offer the toggle for kinds the venue actually has seeded
  const offeredKinds = ACTIVITY_KINDS.filter(k => availability.tables.some(t => t.kind === k));

  const pick = (tableId: number) => {
    const spot = availability.tables.find(t => t.tableId === tableId);
    if (spot) selectTable(tableId, spot.kind, spot.label);
  };

  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold text-creme">{m.step_table_title()}</h2>
      <p className="mb-4 text-sm text-grey-cool">
        {formatHour(startHour)}–{formatHour(startHour + durationHours)}
      </p>

      {/* Filters the chip list below, so it is only useful where those chips are:
          on desktop you pick straight off the plan and this would do nothing */}
      {offeredKinds.length > 1 ? (
        <div role="group" aria-label={m.step_table_title()} className="mb-4 flex gap-2 md:hidden">
          {offeredKinds.map(option => {
            const freeCount = availability.tables.filter(
              t => t.kind === option && freeTableIds.has(t.tableId)
            ).length;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={`h-10 flex-1 rounded-[10px] px-3 text-sm font-semibold transition-colors ${
                  kind === option
                    ? 'bg-golden text-btn-text'
                    : 'bg-club-green-light text-creme hover:bg-surface-hover'
                }`}
              >
                {KIND_ICON[option]} {activityName(option)}
                <span className={kind === option ? 'opacity-70' : 'text-grey-cool'}>
                  {' '}
                  ({freeCount})
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Narrow screens: the plan is a map you consult, this is the control you
          pick with — inline chips, not a dropdown. A Select popover has nowhere
          to go here: the trigger sits against a ~470px-tall floor plan, so on a
          phone React Aria either clamped it to max-height 0 (pinned below, no
          room) or flipped it up over the plan, hiding the very map that tells
          you where "Table 4" is. Chips also match the hour/duration grids on
          the step before, and picking is one tap either way — `selectTable`
          advances the wizard, so there was never anything to confirm. */}
      {freeOfKind.length > 0 ? (
        <div key={kind} className="mb-4 flex flex-wrap gap-2 md:hidden">
          {freeOfKind.map(table => (
            <button
              key={table.tableId}
              type="button"
              onClick={() => pick(table.tableId)}
              className="anim-stagger-item h-10 rounded-[10px] bg-club-green-light px-3 text-sm font-semibold text-creme transition hover:bg-surface-hover active:scale-95"
            >
              {KIND_ICON[table.kind]} {spotName(table.kind, table.label)}
            </button>
          ))}
        </div>
      ) : null}

      {/* Only this kind is out: the toggle above is the fix, so no step-back */}
      {freeOfKind.length === 0 && !roomIsBusy ? (
        <p className="mb-4 text-center text-grey-cool md:hidden">{m.no_kind_free()}</p>
      ) : null}

      {/* The plan always shows the whole room — the toggle drives the chips above */}
      <FloorPlan spots={spots} freeTableIds={freeTableIds} onSelect={pick} />

      {/* Whole room busy at this hour. Keyed off every spot, not the selected
          kind: on desktop the toggle is hidden, so `kind` never moves off
          billiard and a free dartboard would otherwise read as nothing free. */}
      {roomIsBusy ? (
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
