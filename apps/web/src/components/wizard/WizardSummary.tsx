import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import {
  discountGroszFor,
  formatPln,
  gamesFor,
  sizeOf,
  spotPriceGrosz,
  type RateTable
} from '@repo/shared';
import { formatDayLong, formatHour, intlTag } from '../../lib/format';
import { menuQuery } from '../../lib/queries';
import { gameName, spotDescription, spotRentalLabel, spotSummaryLabel } from '../../lib/spots';
import { useVenueConfig } from '../../lib/venue-config';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';
import { selectGame, wizardStore, type WizardState } from '../../store/booking-wizard';
import { orderLinesFrom } from './booking-request';

export interface WizardTotals {
  /** The rental, once a spot is picked; null before */
  rental: number | null;
  /** What the guest pays: rental + bar − sport cards; a "from" estimate before a spot */
  total: number;
  estimate: boolean;
}

/**
 * The money side of the picks so far. Before a spot is chosen the cheapest
 * rate stands in ("from …"): the length is known, the table is not. A preview
 * — the server prices the booking itself and locks the discount in.
 */
export function useWizardTotals(): WizardTotals {
  const state = useStore(wizardStore);
  const { rates } = useVenueConfig();
  const menu = useOrderMenu(state.items);
  const food = orderLinesFrom(state.items, menu).reduce(
    (sum, line) => sum + line.item.priceGrosz * line.quantity,
    0
  );
  if (state.tableId === null || state.kind === null) {
    return { rental: null, total: cheapest(rates) * state.durationHours + food, estimate: true };
  }
  const rental = spotPriceGrosz(
    { id: state.tableId, kind: state.kind },
    state.durationHours,
    rates
  );
  const discount = discountGroszFor(state.sportCardCount, rental);
  return { rental, total: rental + food - discount, estimate: false };
}

/**
 * The bar menu, once there is an order to price. Step 1 shows the summary
 * too, and with nothing ordered the menu is not worth a request yet; by the
 * time there is, the bar step has already loaded it.
 */
function useOrderMenu(items: WizardState['items']) {
  const { data } = useQuery({
    ...menuQuery(getLocale()),
    enabled: Object.keys(items).length > 0
  });
  return data;
}

function cheapest(rates: RateTable): number {
  return Math.min(...Object.values(rates));
}

const caption = 'text-xs font-bold tracking-[0.12em] text-grey-cool uppercase';
const money = (grosz: number) => formatPln(grosz, intlTag());

function timeRange(state: WizardState): string {
  if (state.startHour === null) return '—';
  return `${formatHour(state.startHour)}–${formatHour(state.startHour + state.durationHours)}`;
}

function spotText(state: WizardState): string | null {
  if (state.tableLabel === null || state.kind === null) return null;
  return spotDescription(state.kind, state.tableLabel, {
    size: state.tableId === null ? null : sizeOf(state.tableId)
  });
}

/** The game row: a toggle where the table offers a choice, the plain fact where it does not. */
function GamePick({ state }: { state: WizardState }) {
  const games = state.tableId === null ? [] : gamesFor(state.tableId);
  if (games.length === 0) return null;
  return (
    <div className="col-span-2">
      <dt className={caption}>{m.game_label()}</dt>
      <dd className="mt-1.5 flex justify-center">
        {games.length > 1 ? (
          <div
            role="group"
            aria-label={m.game_label()}
            className="inline-flex gap-1 rounded-xl bg-card p-1"
          >
            {games.map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={state.game === option}
                onClick={() => selectGame(option)}
                className="segment h-9 px-4 text-sm"
              >
                {gameName(option)}
              </button>
            ))}
          </div>
        ) : state.game ? (
          <span className="font-bold">{gameName(state.game)}</span>
        ) : null}
      </dd>
    </div>
  );
}

/** Date, time, spot and game — what has been picked so far. */
function SummaryFacts({ state }: { state: WizardState }) {
  const spot = spotText(state);
  return (
    <dl className="mt-5.5 grid grid-cols-2 gap-x-3 gap-y-4.5">
      <div className="col-span-2">
        <dt className={caption}>{m.summary_date()}</dt>
        <dd className="mt-1 font-bold first-letter:uppercase">
          {state.date === null ? '—' : formatDayLong(state.date)}
        </dd>
      </div>
      <div>
        <dt className={caption}>{m.summary_time()}</dt>
        <dd className="mt-1 font-bold tabular-nums">{timeRange(state)}</dd>
      </div>
      <div>
        <dt className={caption}>{spotSummaryLabel(state.kind ?? 'billiard')}</dt>
        <dd className={`mt-1 ${spot === null ? 'font-semibold text-grey-cool' : 'font-bold'}`}>
          {spot ?? m.summary_pick_later()}
        </dd>
      </div>
      <GamePick state={state} />
    </dl>
  );
}

/** The rental, each bar line and the sport-card discount, once a spot is priced. */
function PriceLines({ state, rental }: { state: WizardState; rental: number }) {
  const menu = useOrderMenu(state.items);
  const lines = orderLinesFrom(state.items, menu);
  const discount = discountGroszFor(state.sportCardCount, rental);
  if (state.kind === null) return null;
  return (
    <ul className="mb-4.5 flex flex-col gap-2 text-[15px] text-cream-soft">
      <li>
        {spotRentalLabel(state.kind)} · {m.hours_n({ n: state.durationHours })} —{' '}
        <strong className="text-creme">{money(rental)}</strong>
      </li>
      {lines.map(line => (
        <li key={line.item.id}>
          {line.item.name} × {line.quantity} —{' '}
          <strong className="text-creme">{money(line.item.priceGrosz * line.quantity)}</strong>
        </li>
      ))}
      {discount > 0 ? (
        <li>
          {m.sport_cards_count({ n: state.sportCardCount })} —{' '}
          <strong className="text-golden">−{money(discount)}</strong>
        </li>
      ) : null}
    </ul>
  );
}

/** The total, or before a spot is chosen a "from …" estimate with the three rates under it. */
function SummaryTotal({ totals }: { totals: WizardTotals }) {
  const { rates } = useVenueConfig();
  if (!totals.estimate) {
    return (
      <>
        <p className={caption}>{m.total()}</p>
        <p className="mt-1 text-[34px] leading-tight font-bold text-golden tabular-nums">
          {money(totals.total)}
        </p>
      </>
    );
  }
  return (
    <>
      <p className={caption}>{m.summary_estimate()}</p>
      <p className="mt-1 text-[34px] leading-tight font-bold text-golden tabular-nums">
        {m.summary_from({ price: money(totals.total) })}
      </p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-grey-cool">
        9ft — {money(rates['9ft'])}
        {m.per_hour_short()}
        <br />
        12ft — {money(rates['12ft'])}
        {m.per_hour_short()}
        <br />
        {m.activity_darts()} — {money(rates.darts)}
        {m.per_hour_short()}
      </p>
    </>
  );
}

/**
 * "Your booking": the picks so far and what they cost, centred like a ticket.
 * The desktop sidebar and the details step on a phone both show it; the game
 * can still be switched here where the table offers a choice.
 */
export function WizardSummary() {
  const state = useStore(wizardStore);
  const totals = useWizardTotals();

  return (
    <div className="text-center">
      <h2 className="text-lg font-bold text-golden">{m.summary_title()}</h2>
      <SummaryFacts state={state} />
      <div aria-hidden className="my-5.5 h-px bg-creme/14" />
      {totals.rental !== null ? <PriceLines state={state} rental={totals.rental} /> : null}
      <SummaryTotal totals={totals} />
    </div>
  );
}
