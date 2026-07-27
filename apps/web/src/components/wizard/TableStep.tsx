import { Button, ListBox, Select, Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ActivityKind, IsoDate } from '@repo/shared';
import { m } from '../../paraglide/messages.js';
import { formatHour } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { useLiveAvailability } from '../../lib/availability-live';
import { ACTIVITY_KINDS, activityName, spotName } from '../../lib/spots';
import { Reveal } from '../motion';
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

      {offeredKinds.length > 1 ? (
        <div role="group" aria-label={m.step_table_title()} className="mb-4 flex gap-2">
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

      {/* The plan always shows the whole room — the toggle drives the picker below */}
      <FloorPlan spots={spots} freeTableIds={freeTableIds} onSelect={pick} />

      {/* Narrow screens: the plan is a map; picking happens in the select below */}
      {freeOfKind.length > 0 ? (
        <Reveal className="mt-4 md:hidden">
          <Select
            key={kind}
            aria-label={m.step_table_title()}
            placeholder={m.step_table_title()}
            className="w-full"
            onSelectionChange={key => {
              const tableId = Number(key);
              if (freeTableIds.has(tableId)) pick(tableId);
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            {/* Never flip above the trigger: an upward popover covers the floor
                plan, which the user needs to see while choosing. Capped height
                scrolls instead when space below is tight. */}
            <Select.Popover shouldFlip={false} maxHeight={260}>
              <ListBox>
                {freeOfKind.map(table => (
                  <ListBox.Item
                    key={table.tableId}
                    id={String(table.tableId)}
                    textValue={spotName(table.kind, table.label)}
                  >
                    {KIND_ICON[table.kind]} {spotName(table.kind, table.label)}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </Reveal>
      ) : null}

      {freeOfKind.length === 0 ? (
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
