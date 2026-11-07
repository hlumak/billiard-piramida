import { useEffect, useState } from 'react';
import { Button, Input, Label, Modal, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import {
  MAX_CLOSE_HOUR,
  MAX_HOURLY_RATE_GROSZ,
  isClosedAllDay,
  isValidWeek,
  type DayHours,
  type RateTier,
  type VenueConfigDto,
  type WeeklyHours
} from '@repo/shared';
import { adminApi, adminVenueConfigQuery } from '../../lib/admin-api';
import { formatHour, weekdayName } from '../../lib/format';
import { parseZloty } from '../../lib/money';
import { WEEKDAY_DISPLAY_ORDER } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';
import { AdminSwitch } from './AdminSwitch';
import { QueryError } from '../QueryError';
import { AdminClosures } from './AdminClosures';

const RATE_ROWS: { tier: RateTier; label: () => string }[] = [
  { tier: '9ft', label: m.admin_rate_9ft },
  { tier: '12ft', label: m.admin_rate_12ft },
  { tier: 'darts', label: m.admin_rate_darts }
];

/** 0–23: the club's day starts on the day it opens. */
const OPEN_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);
/**
 * 0–24, then into the next morning up to MAX_CLOSE_HOUR (25 = 01:00): a
 * booking must end by closing time, so 24 is a legal closing hour too.
 */
const CLOSE_OPTIONS = Array.from({ length: MAX_CLOSE_HOUR + 1 }, (_, hour) => hour);

/** Rates are typed in złoty; the wire format is grosze. */
type RateDraft = Record<RateTier, string>;

function ratesToDraft(config: VenueConfigDto): RateDraft {
  return {
    '9ft': String(config.rates['9ft'] / 100),
    '12ft': String(config.rates['12ft'] / 100),
    darts: String(config.rates.darts / 100)
  };
}

/** Blank is invalid, not a free hour — see parseZloty. */
function parseRate(value: string): number | null {
  return parseZloty(value, MAX_HOURLY_RATE_GROSZ);
}

function HourSelect({
  value,
  label,
  options,
  isDisabled,
  onChange
}: {
  value: number;
  label: string;
  options: readonly number[];
  isDisabled: boolean;
  onChange: (hour: number) => void;
}) {
  return (
    // A native select: a couple of dozen fixed options need no combobox,
    // and it is the one control a phone renders as a proper wheel. The
    // visible name is the column header above the rows.
    <select
      aria-label={label}
      value={value}
      disabled={isDisabled}
      onChange={event => onChange(Number(event.target.value))}
      className="h-10 w-full rounded-[10px] bg-club-green-light px-2.5 text-sm font-semibold text-creme tabular-nums outline-none ring-1 ring-transparent focus:ring-golden disabled:opacity-35"
    >
      {options.map(hour => (
        <option key={hour} value={hour}>
          {hour > 24 ? m.hours_next_day({ time: formatHour(hour) }) : formatHour(hour)}
        </option>
      ))}
    </select>
  );
}

type VenueDraft = { rates: RateDraft; hours: WeeklyHours };

/** Edited and not yet saved: the save bar shows, and leaving asks first. */
function isDirty(draft: VenueDraft | null, config: VenueConfigDto | undefined): boolean {
  if (draft === null || config === undefined) return false;
  return (
    JSON.stringify(draft) !== JSON.stringify({ rates: ratesToDraft(config), hours: config.hours })
  );
}

/**
 * Prices and hours save together. The bar shows up once something changed
 * and stays in reach while staff scroll the week; before, one Save sat at the
 * very bottom and nothing said an edit was pending. After a save it says
 * "Saved" (or the error) until the parent clears the mutation.
 */
function SaveBar({
  dirty,
  canSave,
  status,
  onDiscard,
  onSave
}: {
  dirty: boolean;
  canSave: boolean;
  status: 'idle' | 'pending' | 'success' | 'error';
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (!dirty && status === 'idle') return null;
  let text = <span className="text-golden-light">{m.saved_ok()}</span>;
  if (status === 'error')
    text = <span className="text-danger-soft-foreground">{m.err_generic()}</span>;
  else if (dirty) text = <>{m.admin_unsaved()}</>;
  return (
    <div
      role="status"
      className="anim-reveal sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-golden/45 bg-club-green-dark px-4 py-3 shadow-[0_12px_32px_rgb(0_0_0/0.35)] lg:bottom-4"
    >
      <span className="mr-auto text-sm font-semibold text-creme">{text}</span>
      {dirty ? (
        <>
          <Button variant="ghost" size="sm" onPress={onDiscard}>
            {m.admin_discard_changes()}
          </Button>
          <Button
            size="sm"
            className="btn-gold"
            isDisabled={!canSave}
            isPending={status === 'pending'}
            onPress={onSave}
          >
            {m.btn_save()}
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** Asked when staff leave the section (or the page) with edits unsaved. */
function LeaveDialog({
  blocker
}: {
  blocker: {
    status: 'blocked' | 'idle';
    reset: (() => void) | undefined;
    proceed: (() => void) | undefined;
  };
}) {
  return (
    <Modal
      isOpen={blocker.status === 'blocked'}
      onOpenChange={open => {
        if (!open) blocker.reset?.();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-100">
            <Modal.Header>
              <Modal.Heading>{m.admin_leave_title()}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-cream-soft">{m.admin_leave_text()}</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => blocker.reset?.()}>
                {m.admin_stay()}
              </Button>
              <Button variant="danger" onPress={() => blocker.proceed?.()}>
                {m.admin_leave_action()}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/**
 * Rates and opening hours. Saved as one document rather than field by field:
 * the seven days and three tiers are a single consistent picture, and the API
 * replaces them in one transaction.
 *
 * Repricing never touches money already quoted — a booking carries the rate it
 * was written at — which is what the hint under the rates says out loud.
 */
export function AdminVenueConfig({ onShowBooking }: { onShowBooking: (phone: string) => void }) {
  const queryClient = useQueryClient();
  const { data: config, isPending, isError, error, refetch } = useQuery(adminVenueConfigQuery());
  const [draft, setDraft] = useState<VenueDraft | null>(null);

  // Seeded from the server copy on first load, then owned by the form
  const current = draft ?? (config ? { rates: ratesToDraft(config), hours: config.hours } : null);
  const dirty = isDirty(draft, config);
  const leaving = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true
  });

  const save = useMutation({
    mutationFn: () => {
      if (!current) throw new Error('nothing to save');
      const rates = {
        '9ft': parseRate(current.rates['9ft']),
        '12ft': parseRate(current.rates['12ft']),
        darts: parseRate(current.rates.darts)
      };
      if (rates['9ft'] === null || rates['12ft'] === null || rates.darts === null) {
        throw new Error('invalid rate');
      }
      return adminApi.saveVenueConfig({
        rates: { '9ft': rates['9ft'], '12ft': rates['12ft'], darts: rates.darts },
        hours: current.hours
      });
    },
    onSuccess: saved => {
      setDraft(null);
      queryClient.setQueryData(adminVenueConfigQuery().queryKey, saved);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      // The storefront prices, the hours card and every slot grid all move
      queryClient.invalidateQueries({ queryKey: ['venue-config'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    }
  });

  // "Saved" answers the press, then gets out of the way
  const { isSuccess: justSaved, reset: resetSave } = save;
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(resetSave, 3000);
    return () => clearTimeout(timer);
  }, [justSaved, resetSave]);

  if (isError && !config) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isPending || !current) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  const setDay = (weekday: number, day: DayHours) => {
    const hours = [...current.hours] as WeeklyHours;
    hours[weekday] = day;
    setDraft({ ...current, hours });
  };

  const ratesValid = RATE_ROWS.every(row => parseRate(current.rates[row.tier]) !== null);
  // A closed day is `open === close`; a backwards pair is a mistake, and so
  // is a night past midnight that runs into the next day's opening
  const backwards = current.hours.some(day => day.open > day.close);
  const hoursValid = !backwards && isValidWeek(current.hours);

  return (
    <div className="flex flex-col gap-6">
      {/* Saved on its own, unlike the form below: a closure is a thing staff
          add on the day, not part of the club's standing settings */}
      <AdminClosures onShowBooking={onShowBooking} />

      <section className="card p-5">
        <h3 className="mb-3 font-semibold text-golden-light">{m.admin_rates_title()}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {RATE_ROWS.map(row => (
            <TextField
              key={row.tier}
              name={`rate-${row.tier}`}
              value={current.rates[row.tier]}
              onChange={value =>
                setDraft({ ...current, rates: { ...current.rates, [row.tier]: value } })
              }
              isInvalid={parseRate(current.rates[row.tier]) === null}
            >
              <Label>{row.label()}</Label>
              <Input inputMode="decimal" placeholder="50" />
            </TextField>
          ))}
        </div>
        <p className="mt-3 text-xs text-grey-cool">{m.admin_settings_hint()}</p>
      </section>

      <section className="card p-5">
        <h3 className="mb-3 font-semibold text-golden-light">{m.admin_hours_title()}</h3>
        <div
          aria-hidden
          className="mb-1.5 hidden grid-cols-[minmax(7rem,1fr)_8.5rem_12rem_minmax(7rem,1fr)] gap-3 px-3 text-xs text-grey-cool sm:grid"
        >
          <span />
          <span>{m.admin_hours_open()}</span>
          <span>{m.admin_hours_close()}</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {WEEKDAY_DISPLAY_ORDER.map(weekday => {
            const day = current.hours[weekday];
            if (!day) return null;
            const closed = isClosedAllDay(day);
            return (
              <li
                key={weekday}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-2 rounded-xl bg-club-green px-3 py-2 sm:grid-cols-[minmax(7rem,1fr)_8.5rem_12rem_minmax(7rem,1fr)]"
              >
                <span className="font-medium capitalize text-creme">{weekdayName(weekday)}</span>
                <HourSelect
                  label={m.admin_hours_open()}
                  options={OPEN_OPTIONS}
                  value={day.open}
                  isDisabled={closed}
                  onChange={open => setDay(weekday, { ...day, open })}
                />
                <HourSelect
                  label={m.admin_hours_close()}
                  options={CLOSE_OPTIONS}
                  value={day.close}
                  isDisabled={closed}
                  onChange={close => setDay(weekday, { ...day, close })}
                />
                <AdminSwitch
                  isSelected={closed}
                  // Shutting a day collapses the window to nothing; reopening
                  // restores the club's usual afternoon rather than 00:00.
                  onChange={shut =>
                    setDay(weekday, shut ? { open: 0, close: 0 } : { open: 16, close: 22 })
                  }
                  className="col-start-2 row-start-1 justify-self-end sm:col-start-4 sm:justify-self-start"
                >
                  {m.admin_day_closed()}
                </AdminSwitch>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-grey-cool">{m.admin_hours_hint()}</p>
        {!hoursValid ? (
          <p className="mt-3 text-sm text-danger-soft-foreground">
            {backwards ? m.admin_hours_invalid() : m.admin_hours_overlap()}
          </p>
        ) : null}
      </section>

      <SaveBar
        dirty={dirty}
        canSave={ratesValid && hoursValid}
        status={save.status}
        onDiscard={() => setDraft(null)}
        onSave={() => save.mutate()}
      />
      <LeaveDialog blocker={leaving} />
    </div>
  );
}
