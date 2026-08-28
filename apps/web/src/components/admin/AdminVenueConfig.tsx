import { useState } from 'react';
import { Button, Input, Label, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_HOURLY_RATE_GROSZ,
  isClosedAllDay,
  type DayHours,
  type RateTier,
  type VenueConfigDto,
  type WeeklyHours
} from '@repo/shared';
import { adminApi, adminVenueConfigQuery } from '../../lib/admin-api';
import { formatHour, weekdayName } from '../../lib/format';
import { WEEKDAY_DISPLAY_ORDER } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';

const RATE_ROWS: { tier: RateTier; label: () => string }[] = [
  { tier: '9ft', label: m.admin_rate_9ft },
  { tier: '12ft', label: m.admin_rate_12ft },
  { tier: 'darts', label: m.admin_rate_darts }
];

/** 0–24: a booking must end by closing time, so 24 is a legal closing hour. */
const HOUR_OPTIONS = Array.from({ length: 25 }, (_, hour) => hour);

/** Rates are typed in złoty; the wire format is grosze. */
type RateDraft = Record<RateTier, string>;

function ratesToDraft(config: VenueConfigDto): RateDraft {
  return {
    '9ft': String(config.rates['9ft'] / 100),
    '12ft': String(config.rates['12ft'] / 100),
    darts: String(config.rates.darts / 100)
  };
}

function parseRate(value: string): number | null {
  const parsed = Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const grosz = Math.round(parsed * 100);
  return grosz <= MAX_HOURLY_RATE_GROSZ ? grosz : null;
}

function HourSelect({
  value,
  label,
  isDisabled,
  onChange
}: {
  value: number;
  label: string;
  isDisabled: boolean;
  onChange: (hour: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-grey-cool">
      {label}
      {/* A native select: 25 fixed options need no combobox, and it is the one
          control a phone renders as a proper wheel. */}
      <select
        value={value}
        disabled={isDisabled}
        onChange={event => onChange(Number(event.target.value))}
        className="h-10 rounded-[10px] bg-club-green px-2 text-sm text-creme outline-none ring-1 ring-transparent focus:ring-golden disabled:opacity-40"
      >
        {HOUR_OPTIONS.map(hour => (
          <option key={hour} value={hour}>
            {formatHour(hour)}
          </option>
        ))}
      </select>
    </label>
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
export function AdminVenueConfig() {
  const queryClient = useQueryClient();
  const { data: config, isPending, isError, refetch } = useQuery(adminVenueConfigQuery());
  const [draft, setDraft] = useState<{ rates: RateDraft; hours: WeeklyHours } | null>(null);

  // Seeded from the server copy on first load, then owned by the form
  const current = draft ?? (config ? { rates: ratesToDraft(config), hours: config.hours } : null);

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
      setDraft({ rates: ratesToDraft(saved), hours: saved.hours });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      // The storefront prices, the hours card and every slot grid all move
      queryClient.invalidateQueries({ queryKey: ['venue-config'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    }
  });

  if (isError) return <QueryError onRetry={() => refetch()} />;
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
  // A closed day is `open === close`; only a backwards pair is a mistake
  const hoursValid = current.hours.every(day => day.open <= day.close);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[10px] bg-club-green-light p-4">
        <h3 className="mb-3 font-semibold text-golden">{m.admin_rates_title()}</h3>
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

      <section className="rounded-[10px] bg-club-green-light p-4">
        <h3 className="mb-3 font-semibold text-golden">{m.admin_hours_title()}</h3>
        <ul className="flex flex-col gap-2">
          {WEEKDAY_DISPLAY_ORDER.map(weekday => {
            const day = current.hours[weekday];
            if (!day) return null;
            const closed = isClosedAllDay(day);
            return (
              <li
                key={weekday}
                className="flex flex-wrap items-end gap-3 rounded-[10px] bg-club-green p-3"
              >
                <span className="min-w-28 flex-1 font-medium capitalize text-creme">
                  {weekdayName(weekday)}
                </span>
                <HourSelect
                  label={m.admin_hours_open()}
                  value={day.open}
                  isDisabled={closed}
                  onChange={open => setDay(weekday, { ...day, open })}
                />
                <HourSelect
                  label={m.admin_hours_close()}
                  value={day.close}
                  isDisabled={closed}
                  onChange={close => setDay(weekday, { ...day, close })}
                />
                <label className="flex items-center gap-2 text-sm text-creme">
                  <input
                    type="checkbox"
                    checked={closed}
                    // Shutting a day collapses the window to nothing; reopening
                    // restores the club's usual afternoon rather than 00:00.
                    onChange={event =>
                      setDay(
                        weekday,
                        event.target.checked ? { open: 0, close: 0 } : { open: 16, close: 22 }
                      )
                    }
                    className="size-4 accent-golden"
                  />
                  {m.admin_day_closed()}
                </label>
              </li>
            );
          })}
        </ul>
        {!hoursValid ? (
          <p className="mt-3 text-sm text-danger-soft-foreground">{m.admin_hours_invalid()}</p>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <Button
          className="font-bold"
          isDisabled={!ratesValid || !hoursValid}
          isPending={save.isPending}
          onPress={() => save.mutate()}
        >
          {m.btn_save()}
        </Button>
        {save.isSuccess ? <span className="text-sm text-golden">{m.saved_ok()}</span> : null}
        {save.isError ? (
          <span className="text-sm text-danger-soft-foreground">{m.err_generic()}</span>
        ) : null}
      </div>
    </div>
  );
}
