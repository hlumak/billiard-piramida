import { useState } from 'react';
import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import {
  formatPln,
  gamesFor,
  hallOf,
  sizeOf,
  type ActivityKind,
  type AvailabilityDto,
  type IsoDate,
  type RateTable
} from '@repo/shared';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { formatDayLong, formatHour, intlTag } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { useLiveAvailability } from '../../lib/availability-live';
import { ACTIVITY_KINDS, activityName, gameName, spotName } from '../../lib/spots';
import { useVenueConfig } from '../../lib/venue-config';
import { QueryError } from '../QueryError';
import { goToStep, selectTable } from '../../store/booking-wizard';
import { FloorPlan, PlanLegend } from './FloorPlan';
import { freeSpotIds } from './free-spots';
import { StepActions } from './WizardFrame';

type Spot = AvailabilityDto['tables'][number];

interface SpotGroup {
  key: string;
  title: string;
  /** Rate and what is played there */
  detail: string;
  spots: Spot[];
}

/**
 * The chips under the plan, the way the room is split: hall 1's 9ft tables,
 * hall 2's 12ft ones — each with its rate and games — or the dartboards.
 */
function spotGroups(spots: Spot[], kind: ActivityKind, rates: RateTable): SpotGroup[] {
  const money = (grosz: number) => `${formatPln(grosz, intlTag())}${m.per_hour_short()}`;
  const ofKind = spots.filter(spot => spot.kind === kind);
  if (kind === 'darts') {
    return ofKind.length === 0
      ? []
      : [{ key: 'darts', title: activityName('darts'), detail: money(rates.darts), spots: ofKind }];
  }
  return ([1, 2] as const)
    .map(hall => {
      const inHall = ofKind.filter(spot => hallOf(spot.tableId) === hall);
      const first = inHall[0];
      if (first === undefined) return null;
      const size = sizeOf(first.tableId);
      // Listed most-booked first (pyramid); said the other way round, "pool or pyramid"
      const [usual, other] = gamesFor(first.tableId).map(game =>
        gameName(game).toLocaleLowerCase(getLocale())
      );
      const played =
        usual !== undefined && other !== undefined
          ? m.games_either({ a: other, b: usual })
          : (usual ?? '');
      return {
        key: `hall-${hall}`,
        title: [m.hall_n({ n: hall }), size].filter(Boolean).join(' · '),
        detail: [size ? money(rates[size]) : null, played].filter(Boolean).join(' · '),
        spots: inHall
      };
    })
    .filter(group => group !== null);
}

export function TableStep({
  date,
  startHour,
  durationHours,
  tableId,
  kind: pickedKind
}: {
  date: IsoDate;
  startHour: number;
  durationHours: number;
  tableId: number | null;
  kind: ActivityKind | null;
}) {
  useLiveAvailability(date);
  const {
    data: availability,
    isPending,
    isError,
    error,
    refetch
  } = useQuery(availabilityQuery(date));
  const { rates } = useVenueConfig();
  // The chips show one kind at a time; a spot already picked decides which
  const [kind, setKind] = useState<ActivityKind>(pickedKind ?? 'billiard');

  if (isError && !availability) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isPending || !availability) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  const free = freeSpotIds(availability.tables, startHour, durationHours);
  const roomIsBusy = free.size === 0;
  // Someone else can take the picked spot meanwhile: then it is no longer picked
  const picked = tableId !== null && free.has(tableId) ? tableId : null;
  const offeredKinds = ACTIVITY_KINDS.filter(k => availability.tables.some(t => t.kind === k));
  const groups = spotGroups(availability.tables, kind, rates);

  const pick = (id: number) => {
    const spot = availability.tables.find(t => t.tableId === id);
    if (!spot) return;
    selectTable(id, spot.kind, spot.label);
    setKind(spot.kind);
  };

  const when = `${formatDayLong(date)} · ${formatHour(startHour)}–${formatHour(startHour + durationHours)}`;

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-5">
        <div>
          <h2 className="text-2xl font-bold md:text-[26px]">{m.step_table_title()}</h2>
          <p className="mt-1 text-sm text-grey-cool first-letter:uppercase md:mt-1.5 md:text-[15px]">
            {when}
          </p>
        </div>
        {offeredKinds.length > 1 ? (
          <div
            role="group"
            aria-label={m.step_table_title()}
            className="grid grid-cols-2 gap-1 rounded-[14px] bg-card p-1.25 md:inline-flex md:flex-none"
          >
            {offeredKinds.map(option => {
              const count = availability.tables.filter(
                t => t.kind === option && free.has(t.tableId)
              ).length;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                  className="segment h-11 px-4.5 text-[15px] md:h-10.5"
                >
                  {/* One inline run: the button is a flex box, and a bare
                      space between flex items would be dropped */}
                  <span>
                    {activityName(option)} · <span className="md:hidden">{count}</span>
                    <span className="hidden md:inline">{m.free_n({ n: count })}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {roomIsBusy ? (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl bg-card p-6 text-center">
          <p className="text-grey-cool">{m.no_tables_free()}</p>
          <button
            type="button"
            onClick={() => goToStep('when')}
            className="btn-outline h-11 px-5 text-[15px]"
          >
            ← {m.change_time()}
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid items-start gap-5.5 md:mt-6.5 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] xl:gap-7">
        <div className="rounded-[18px] bg-club-green-dark p-3.5 md:bg-transparent md:p-0">
          <div className="mx-auto max-w-[400px]">
            <FloorPlan
              spots={availability.tables.map(t => ({
                id: t.tableId,
                label: t.label,
                kind: t.kind
              }))}
              freeTableIds={free}
              selectedId={picked}
              onSelect={pick}
            />
          </div>
          <PlanLegend className="mt-3 flex-wrap gap-x-3.5 gap-y-1.5 text-xs md:hidden" />
        </div>

        <div className="flex flex-col gap-5 md:gap-6">
          {groups.length === 0 ? (
            <p className="text-grey-cool">{m.no_kind_free()}</p>
          ) : (
            groups.map(group => (
              <section key={`${kind}-${group.key}`} aria-label={group.title}>
                <h3 className="text-sm font-bold md:text-[15px]">
                  {group.title}
                  <span className="font-medium text-grey-cool md:hidden"> · {group.detail}</span>
                </h3>
                <p className="mt-1 hidden text-[13px] text-grey-cool md:block">{group.detail}</p>
                <div className="mt-2.5 grid grid-cols-5 gap-2 md:mt-3">
                  {group.spots.map(spot => {
                    const isFree = free.has(spot.tableId);
                    const name = spotName(spot.kind, spot.label);
                    return (
                      <button
                        key={spot.tableId}
                        type="button"
                        aria-pressed={isFree ? picked === spot.tableId : undefined}
                        aria-label={isFree ? name : `${name}, ${m.plan_taken_now()}`}
                        disabled={!isFree}
                        onClick={() => pick(spot.tableId)}
                        className="chip anim-stagger-item h-12 text-base disabled:border-[1.5px] disabled:border-dashed disabled:border-creme/22 disabled:shadow-none md:h-12.5 md:text-[17px]"
                      >
                        {spot.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
          <PlanLegend className="hidden flex-col gap-2.5 border-t border-creme/12 pt-4.5 text-sm md:flex" />
        </div>
      </div>

      <StepActions
        action={{
          label: m.next_to_bar(),
          short: m.btn_next(),
          disabled: picked === null,
          onPress: () => goToStep('food')
        }}
        back={{ label: m.change_time(), onPress: () => goToStep('when') }}
      />
    </div>
  );
}
