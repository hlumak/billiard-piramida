import { useState } from 'react';
import { Button, Description, Input, Label, Modal, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, Check, Plus } from 'lucide-react';
import {
  MAX_CLOSURE_REASON_LENGTH,
  addDays,
  hoursForDate,
  isWholeDays,
  type ClosureConflictDto,
  type ClosureDto,
  type IsoDate,
  type TableDto
} from '@repo/shared';
import { formatPhone } from '@repo/shared/phone';
import {
  adminApi,
  adminClosureConflictsQuery,
  adminClosuresQuery,
  type ClosureInput
} from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import {
  dateTileParts,
  formatDay,
  formatHour,
  warsawDate,
  warsawHour,
  warsawTime,
  warsawToday
} from '../../lib/format';
import { tablesQuery } from '../../lib/queries';
import { spotName } from '../../lib/spots';
import { useNowMinute } from '../../lib/use-now';
import { useVenueConfig } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';
import { AdminDatePicker } from './AdminDatePicker';

/**
 * The form's picture of a closure. Staff think in "Saturday 18:00 to 23:00"
 * and "24 to 26 December", so the end is a last day (whole days) or a day
 * and an hour up to 24:00 — turned into the API's exclusive end on save.
 */
interface Draft {
  scope: 'club' | 'spots';
  tableIds: number[];
  wholeDays: boolean;
  startDate: IsoDate;
  startHour: number;
  endDate: IsoDate;
  /** 1–24 */
  endHour: number;
  reason: string;
}

function draftFrom(closure: ClosureDto | null, date: IsoDate, close: number): Draft {
  if (closure === null) {
    return {
      scope: 'club',
      tableIds: [],
      wholeDays: false,
      startDate: date,
      startHour: Math.min(18, close - 1),
      endDate: date,
      endHour: close,
      reason: ''
    };
  }
  const wholeDays = isWholeDays(closure);
  // An end at midnight is the day before's 24:00 (or, in whole days, its last day)
  const atMidnight = closure.endHour === 0;
  return {
    scope: closure.tableIds === null ? 'club' : 'spots',
    tableIds: closure.tableIds ?? [],
    wholeDays,
    startDate: closure.startDate,
    startHour: closure.startHour,
    endDate: atMidnight ? addDays(closure.endDate, -1) : closure.endDate,
    endHour: atMidnight ? 24 : closure.endHour,
    reason: closure.reason ?? ''
  };
}

function inputFrom(draft: Draft): ClosureInput {
  const lastDay = draft.wholeDays || draft.endHour === 24;
  return {
    startDate: draft.startDate,
    startHour: draft.wholeDays ? 0 : draft.startHour,
    endDate: lastDay ? addDays(draft.endDate, 1) : draft.endDate,
    endHour: lastDay ? 0 : draft.endHour,
    tableIds: draft.scope === 'club' ? null : [...draft.tableIds].sort((a, b) => a - b),
    reason: draft.reason.trim() || null
  };
}

/** The end comes after the start (dates compare as strings), and spots, if chosen, exist. */
function isComplete(draft: Draft): boolean {
  if (draft.scope === 'spots' && draft.tableIds.length === 0) return false;
  if (draft.wholeDays) return draft.endDate >= draft.startDate;
  return (
    draft.endDate > draft.startDate ||
    (draft.endDate === draft.startDate && draft.endHour > draft.startHour)
  );
}

const CLOSURE_ERRORS: Record<string, () => string> = {
  closure_conflicts: m.err_closure_conflicts,
  closure_in_past: m.err_closure_in_past,
  invalid_closure: m.err_invalid_closure,
  closure_too_long: m.err_closure_too_long
};

function closureErrorText(error: unknown): string {
  const text = error instanceof ApiError ? CLOSURE_ERRORS[error.code] : undefined;
  return text ? text() : m.err_generic();
}

/** "18:00–23:00", "All day", "24 Dec – 26 Dec", "24 Dec 15:00 – 26 Dec 23:00" */
function whenText(closure: ClosureDto): string {
  const lastDay = closure.endHour === 0 ? addDays(closure.endDate, -1) : closure.endDate;
  const endHour = closure.endHour === 0 ? 24 : closure.endHour;
  if (isWholeDays(closure)) {
    return lastDay === closure.startDate
      ? m.admin_closure_all_day()
      : `${formatDay(closure.startDate)} – ${formatDay(lastDay)}`;
  }
  if (lastDay === closure.startDate) {
    return `${formatHour(closure.startHour)}–${formatHour(endHour)}`;
  }
  return `${formatDay(closure.startDate)} ${formatHour(closure.startHour)} – ${formatDay(lastDay)} ${formatHour(endHour)}`;
}

function scopeText(closure: Pick<ClosureDto, 'tableIds'>, spots: TableDto[]): string {
  if (closure.tableIds === null) return m.admin_closure_whole_club();
  return closure.tableIds
    .map(id => {
      const spot = spots.find(s => s.id === id);
      return spot ? spotName(spot.kind, spot.label) : String(id);
    })
    .join(', ');
}

const HOURS_FROM = Array.from({ length: 24 }, (_, hour) => hour);
const HOURS_TO = Array.from({ length: 24 }, (_, i) => i + 1);

function HourSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (hour: number) => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="h-10 rounded-[10px] bg-club-green px-2 text-sm font-semibold text-creme tabular-nums outline-none ring-1 ring-transparent focus:ring-golden"
      >
        {options.map(hour => (
          <option key={hour} value={hour}>
            {formatHour(hour)}
          </option>
        ))}
      </select>
    </label>
  );
}

const segment = (active: boolean) =>
  `h-10 rounded-[10px] px-4 text-sm font-bold transition-colors ${
    active ? 'bg-golden text-btn-text' : 'text-creme hover:bg-creme/8'
  }`;

/** The whole club, or the spots ticked from the venue's list. */
function ClosureScope({
  scope,
  tableIds,
  spots,
  onChange
}: {
  scope: Draft['scope'];
  tableIds: number[];
  spots: TableDto[];
  onChange: (patch: Partial<Pick<Draft, 'scope' | 'tableIds'>>) => void;
}) {
  const toggleSpot = (id: number) =>
    onChange({
      tableIds: tableIds.includes(id) ? tableIds.filter(t => t !== id) : [...tableIds, id]
    });

  return (
    <fieldset>
      <legend className="text-sm font-bold">{m.admin_closure_what()}</legend>
      <div className="mt-2 inline-flex gap-1 rounded-xl bg-club-green-dark p-1">
        <button
          type="button"
          aria-pressed={scope === 'club'}
          onClick={() => onChange({ scope: 'club' })}
          className={segment(scope === 'club')}
        >
          {m.admin_closure_whole_club()}
        </button>
        <button
          type="button"
          aria-pressed={scope === 'spots'}
          onClick={() => onChange({ scope: 'spots' })}
          className={segment(scope === 'spots')}
        >
          {m.admin_closure_some_spots()}
        </button>
      </div>
      {scope === 'spots' ? (
        <div
          role="group"
          aria-label={m.admin_closure_some_spots()}
          className="mt-3 flex flex-wrap gap-2"
        >
          {spots.map(spot => {
            const on = tableIds.includes(spot.id);
            return (
              <button
                key={spot.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSpot(spot.id)}
                className={`h-10 min-w-22 rounded-[10px] border-[1.5px] px-3 text-sm font-semibold transition-colors ${
                  on
                    ? 'border-golden bg-golden/16 text-golden-light'
                    : 'border-creme/25 text-creme hover:border-creme/45'
                }`}
              >
                {spotName(spot.kind, spot.label)}
              </button>
            );
          })}
        </div>
      ) : null}
      {scope === 'spots' && tableIds.length === 0 ? (
        <p className="mt-2 text-[13px] text-grey-cool">{m.admin_closure_pick_spot()}</p>
      ) : null}
    </fieldset>
  );
}

/**
 * The bookings the closure would land on, each with a way to pull it up, or
 * a word that there are none. Says nothing while the form is incomplete.
 */
function ClosureConflicts({
  conflicts,
  blocking,
  complete,
  spots,
  startDate,
  endDate,
  onShowBooking
}: {
  conflicts: UseQueryResult<ClosureConflictDto[]>;
  /** The conflicts that hold up saving: none while the form is incomplete */
  blocking: ClosureConflictDto[];
  complete: boolean;
  spots: TableDto[];
  startDate: IsoDate;
  endDate: IsoDate;
  onShowBooking: (phone: string) => void;
}) {
  if (complete && conflicts.isError) {
    return <QueryError error={conflicts.error} onRetry={() => conflicts.refetch()} />;
  }
  if (blocking.length === 0) {
    return complete && conflicts.isSuccess && !conflicts.isPlaceholderData ? (
      <p className="flex items-center gap-2.5 text-sm text-cream-soft">
        <Check aria-hidden className="size-4.5 text-golden" strokeWidth={2.6} />
        {m.admin_closure_no_conflicts()}
      </p>
    ) : null;
  }
  return (
    <div
      role="alert"
      className="rounded-2xl border border-[#f4a99c]/45 bg-[rgb(240_128_112/0.1)] p-4"
    >
      <p className="flex items-center gap-2.5 font-bold text-danger-soft-foreground">
        <AlertTriangle aria-hidden className="size-4.5" />
        {m.admin_closure_conflicts({ n: blocking.length })}
      </p>
      <p className="mt-1.5 text-[13px] text-cream-soft">{m.admin_closure_conflicts_hint()}</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {blocking.map(conflict => {
          const spot = spots.find(s => s.id === conflict.tableId);
          const day = warsawDate(conflict.startsAt);
          return (
            <li
              key={conflict.bookingId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-club-green p-2.5"
            >
              <span className="text-sm font-bold tabular-nums">
                {day === startDate && day === endDate ? '' : `${formatDay(day)} `}
                {warsawTime(conflict.startsAt)}–{warsawTime(conflict.endsAt)}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{conflict.customerName}</span>
                {spot ? ` · ${spotName(spot.kind, spot.label)}` : ''}
                <span className="block text-xs text-golden-light">
                  {formatPhone(conflict.customerPhone)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onShowBooking(conflict.customerPhone)}
                className="h-9 rounded-[10px] px-3 text-sm font-semibold text-golden-light hover:bg-creme/8"
              >
                {m.admin_closure_show_booking()} →
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * New or changed closure. While the form is filled in it asks which bookings
 * the closure would land on and lists them; saving waits until there are
 * none — staff move or cancel those (and tell the guests) first.
 */
export function AdminClosureModal({
  closure,
  date,
  isOpen,
  onOpenChange,
  onShowBooking
}: {
  closure: ClosureDto | null;
  /** The day a new closure starts on */
  date: IsoDate;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onShowBooking: (phone: string) => void;
}) {
  const queryClient = useQueryClient();
  const { hours } = useVenueConfig();
  const { data: spots = [] } = useQuery(tablesQuery());
  const [draft, setDraft] = useState<Draft>(() =>
    draftFrom(closure, date, hoursForDate(date, hours).close)
  );
  const update = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));

  const complete = isComplete(draft);
  const input = inputFrom(draft);
  const conflicts = useQuery({
    ...adminClosureConflictsQuery(input),
    enabled: isOpen && complete
  });
  const blocking = complete ? (conflicts.data ?? []) : [];

  const save = useMutation({
    mutationFn: () =>
      closure === null ? adminApi.createClosure(input) : adminApi.updateClosure(closure.id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'closures'] });
      // Guests' hours, date tiles and slot grids all move
      void queryClient.invalidateQueries({ queryKey: ['venue-config'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      onOpenChange(false);
    },
    onError: error => {
      // A booking came in while the form was open: show it
      if (error instanceof ApiError && error.code === 'closure_conflicts') {
        void conflicts.refetch();
      }
    }
  });

  const showBooking = (phone: string) => {
    onOpenChange(false);
    onShowBooking(phone);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container scroll="inside">
          <Modal.Dialog className="sm:max-w-xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                {closure === null ? m.admin_closure_add() : m.admin_closure_edit_title()}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-5">
                <ClosureScope
                  scope={draft.scope}
                  tableIds={draft.tableIds}
                  spots={spots}
                  onChange={update}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-bold">{m.admin_closure_from()}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <AdminDatePicker
                        label={m.admin_closure_from()}
                        clearable={false}
                        value={draft.startDate}
                        onChange={next => {
                          if (next === undefined) return;
                          // The end follows a start moved past it
                          update({
                            startDate: next,
                            endDate: next > draft.endDate ? next : draft.endDate
                          });
                        }}
                      />
                      {draft.wholeDays ? null : (
                        <HourSelect
                          label={m.admin_closure_start_time()}
                          value={draft.startHour}
                          options={HOURS_FROM}
                          onChange={startHour => update({ startHour })}
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-bold">{m.admin_closure_to()}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <AdminDatePicker
                        label={m.admin_closure_to()}
                        clearable={false}
                        value={draft.endDate}
                        onChange={next => {
                          if (next !== undefined) update({ endDate: next });
                        }}
                      />
                      {draft.wholeDays ? null : (
                        <HourSelect
                          label={m.admin_closure_end_time()}
                          value={draft.endHour}
                          options={HOURS_TO}
                          onChange={endHour => update({ endHour })}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <label className="-mt-2 inline-flex items-center gap-2.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={draft.wholeDays}
                    onChange={event => update({ wholeDays: event.target.checked })}
                    className="size-4.5 accent-golden"
                  />
                  {m.admin_closure_whole_days()}
                </label>
                {!complete && draft.scope === 'club' ? (
                  <p className="-mt-2 text-sm text-danger-soft-foreground">
                    {m.err_invalid_closure()}
                  </p>
                ) : null}

                <TextField
                  name="reason"
                  value={draft.reason}
                  onChange={reason => update({ reason })}
                  maxLength={MAX_CLOSURE_REASON_LENGTH}
                >
                  <Label>{m.admin_closure_reason()}</Label>
                  <Input />
                  <Description>{m.admin_closure_reason_hint()}</Description>
                </TextField>

                <ClosureConflicts
                  conflicts={conflicts}
                  blocking={blocking}
                  complete={complete}
                  spots={spots}
                  startDate={draft.startDate}
                  endDate={draft.endDate}
                  onShowBooking={showBooking}
                />

                {save.isError ? (
                  <p role="alert" className="text-sm text-danger-soft-foreground">
                    {closureErrorText(save.error)}
                  </p>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="w-full font-bold"
                isDisabled={!complete || blocking.length > 0 || conflicts.isFetching}
                isPending={save.isPending}
                onPress={() => save.mutate()}
              >
                {closure === null ? m.admin_closure_save() : m.btn_save()}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/**
 * The settings section that lists the closures not over yet, soonest first,
 * with a way to add one, change one, or open the time again.
 */
export function AdminClosures({ onShowBooking }: { onShowBooking: (phone: string) => void }) {
  const queryClient = useQueryClient();
  const { data: closures, isPending, isError, error, refetch } = useQuery(adminClosuresQuery());
  const { data: spots = [] } = useQuery(tablesQuery());
  const now = useNowMinute();
  const today = warsawToday(now);
  // A new modal per opening, so its draft starts from what was clicked
  const [editing, setEditing] = useState<{ closure: ClosureDto | null; key: number } | null>(null);

  const reopen = useMutation({
    mutationFn: (id: string) => adminApi.deleteClosure(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'closures'] });
      void queryClient.invalidateQueries({ queryKey: ['venue-config'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    }
  });

  const hourNow = warsawHour(now);
  const isNow = (closure: ClosureDto) =>
    (closure.startDate < today || (closure.startDate === today && closure.startHour <= hourNow)) &&
    (closure.endDate > today || (closure.endDate === today && closure.endHour > hourNow));

  return (
    <section aria-labelledby="closures-title" className="card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-64 flex-1">
          <h3 id="closures-title" className="font-semibold text-golden-light">
            {m.admin_closures_title()}
          </h3>
          <p className="mt-1 text-sm text-grey-cool">{m.admin_closures_hint()}</p>
        </div>
        <Button
          className="font-bold"
          onPress={() => setEditing({ closure: null, key: Date.now() })}
        >
          <Plus aria-hidden className="size-4.5" strokeWidth={2.6} />
          {m.admin_closure_add()}
        </Button>
      </div>

      {isError && !closures ? (
        <div className="mt-4">
          <QueryError error={error} onRetry={() => refetch()} />
        </div>
      ) : isPending || !closures ? (
        <div className="flex justify-center py-8">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : closures.length === 0 ? (
        <p className="mt-4 rounded-xl bg-club-green px-4 py-3 text-sm text-grey-cool">
          {m.admin_closures_empty()}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {closures.map(closure => {
            const parts = dateTileParts(closure.startDate);
            const current = isNow(closure);
            return (
              <li
                key={closure.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border bg-club-green px-4 py-3 ${
                  current ? 'border-golden/50' : 'border-creme/10'
                }`}
              >
                <div aria-hidden className="w-14 flex-none text-center">
                  <span className="block text-xs font-semibold text-grey-cool capitalize">
                    {parts.weekday}
                  </span>
                  <span className="block text-[22px] leading-tight font-bold">{parts.day}</span>
                  <span className="block text-[11px] font-semibold text-grey-cool">
                    {parts.month}
                  </span>
                </div>
                <div className="min-w-48 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="sr-only">{formatDay(closure.startDate)}, </span>
                    <span className="font-bold tabular-nums">{whenText(closure)}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                        closure.tableIds === null
                          ? 'border-[1.5px] border-golden text-golden-light'
                          : 'bg-creme/10'
                      }`}
                    >
                      {scopeText(closure, spots)}
                    </span>
                    {current ? (
                      <span className="rounded-full bg-golden px-2.5 py-0.5 text-xs font-bold text-btn-text">
                        {m.admin_closure_now()}
                      </span>
                    ) : closure.startDate === today ? (
                      <span className="rounded-full bg-golden/18 px-2.5 py-0.5 text-xs font-bold text-golden-light">
                        {m.hours_today()}
                      </span>
                    ) : null}
                  </p>
                  {closure.reason ? (
                    <p className="mt-0.5 text-sm text-grey-cool">{closure.reason}</p>
                  ) : null}
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setEditing({ closure, key: Date.now() })}
                  >
                    {m.admin_edit_btn()}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-soft"
                    isPending={reopen.isPending && reopen.variables === closure.id}
                    onPress={() => reopen.mutate(closure.id)}
                  >
                    {m.admin_closure_reopen()}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {reopen.isError ? (
        <p role="alert" className="mt-3 text-sm text-danger-soft-foreground">
          {m.err_generic()}
        </p>
      ) : null}

      {editing ? (
        <AdminClosureModal
          key={editing.key}
          closure={editing.closure}
          date={today}
          isOpen
          onOpenChange={open => {
            if (!open) setEditing(null);
          }}
          onShowBooking={onShowBooking}
        />
      ) : null}
    </section>
  );
}
