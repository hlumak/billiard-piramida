import { Suspense, lazy, useEffect, useRef } from 'react';
import { Spinner } from '@heroui/react';
import {
  BOOKING_DAYS_AHEAD,
  MIN_BOOKING_MINUTES,
  addDays,
  isIsoDate,
  type IsoDate
} from '@repo/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { m as msg } from '../paraglide/messages.js';
import { noindexMeta } from '../lib/seo';
import { warsawMinute, warsawToday } from '../lib/format';
import { firstOpenDay, useVenueConfig } from '../lib/venue-config';
import { PageLayout } from '../components/site/PageLayout';
import { BookingStepper } from '../components/wizard/BookingStepper';
import { WhenStep } from '../components/wizard/WhenStep';
import { TableStep } from '../components/wizard/TableStep';
import { FoodStep } from '../components/wizard/FoodStep';
import { WizardFrame } from '../components/wizard/WizardFrame';
import {
  goToStep,
  resetIfDateStale,
  selectDate,
  selectTime,
  stepIndex,
  wizardStore,
  type WizardState,
  type WizardStep
} from '../store/booking-wizard';

/**
 * The last step carries the phone field and libphonenumber's metadata — about
 * 60 kB gzip that only that step uses. Loaded on demand (and prefetched as
 * soon as the guest reaches the table step) instead of with step 1.
 */
const loadDetailsStep = () => import('../components/wizard/DetailsStep');
const DetailsStep = lazy(() => loadDetailsStep().then(module => ({ default: module.DetailsStep })));

export const Route = createFileRoute('/book')({
  // ?date=…&start=… arrives from the home page's free-tables strip: the guest
  // picked an hour there (start is that hour, 18 = 18:00), so the wizard
  // opens on the table step with it set.
  validateSearch: (search: Record<string, unknown>): { date?: IsoDate; start?: number } => {
    // A number, or the digits of one: Number('') and Number(null) are 0 and
    // Number(true) is 1, which would hand the wizard a start nobody picked
    const raw = search.start;
    const start =
      typeof raw === 'number' || (typeof raw === 'string' && /^d{1,2}$/.test(raw))
        ? Number(raw)
        : Number.NaN;
    return {
      ...(typeof search.date === 'string' && isIsoDate(search.date) ? { date: search.date } : {}),
      ...(Number.isInteger(start) && start >= 0 && start <= 23 ? { start } : {})
    };
  },
  head: () => ({ meta: noindexMeta(msg.seo_title_book()) }),
  component: BookingWizard
});

/**
 * Clamp forward jumps to the first step whose prerequisites are missing.
 * Never pushes forward: standing on an earlier step (e.g. going back to
 * change the time) is always valid.
 */
function permittedStep(state: WizardState): WizardStep {
  const index = stepIndex(state.step);
  if (index > stepIndex('when') && (state.date == null || state.startMinute == null)) return 'when';
  if (index > stepIndex('table') && (state.tableId == null || state.kind == null)) return 'table';
  return state.step;
}

/**
 * Single narrowing point: each step only renders when its prerequisites exist,
 * so the steps receive non-null props instead of asserting store fields.
 */
function CurrentStep({ state, step }: { state: WizardState; step: WizardStep }) {
  const { date, startMinute, durationMinutes, tableId, kind, tableLabel, game } = state;
  if (step === 'when' || date == null || startMinute == null) return <WhenStep />;
  // `kind` is written together with `tableId`, so a spot without one can only
  // be a stale store from before darts existed — send them back to re-pick.
  if (step === 'table' || tableId == null || kind == null || tableLabel == null) {
    return (
      <TableStep
        date={date}
        startMinute={startMinute}
        durationMinutes={durationMinutes}
        tableId={tableId}
        kind={kind}
      />
    );
  }
  if (step === 'food') return <FoodStep />;
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner aria-label={msg.loading()} />
        </div>
      }
    >
      <DetailsStep
        draft={{ date, startMinute, durationMinutes, tableId, kind, tableLabel, game }}
      />
    </Suspense>
  );
}

function BookingWizard() {
  const navigate = useNavigate();
  const state = useStore(wizardStore);
  const { hours, closures } = useVenueConfig();

  const prefill = Route.useSearch();

  // Drop an abandoned wizard whose date has since passed, then take an hour
  // handed over by the home page — once, and out of the address bar, so a
  // reload or a back step does not re-pick it. With neither, open on the
  // first day the club is open, so step 1 shows its hours straight away
  // (client-only mutations).
  useEffect(() => {
    const today = warsawToday();
    resetIfDateStale(today);
    const { date, start } = prefill;
    // Only a day the wizard itself would offer: not past, not beyond the window
    if (
      date !== undefined &&
      start !== undefined &&
      date >= today &&
      date < addDays(today, BOOKING_DAYS_AHEAD)
    ) {
      selectDate(date);
      selectTime(start * 60, MIN_BOOKING_MINUTES);
      void navigate({ to: '/book', search: {}, replace: true });
    } else if (wizardStore.state.date === null) {
      const day = firstOpenDay(today, warsawMinute(Date.now()), hours, closures);
      if (day !== null) selectDate(day);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = permittedStep(state);
  // The store carries the direction of the last step change, so a mid-step
  // update (adding a menu item on the bar step) can't flip the wrapper's
  // animation class and replay the slide-in over the whole step. A clamp only
  // ever sends the guest backwards, and holds that until the effect below
  // writes the corrected step to the store.
  const direction = step === state.step ? state.direction : -1;

  useEffect(() => {
    if (step !== state.step) goToStep(step);
  }, [step, state.step]);

  // Two steps ahead of needing it: by the details step the chunk is in cache
  useEffect(() => {
    if (step === 'table' || step === 'food') void loadDetailsStep();
  }, [step]);

  // Each step replaces the last one wholesale, taking the focused control with
  // it: move focus to the new step's heading so keyboard and screen-reader
  // users land at its start and hear what it asks (not on <body>). While a
  // step is still loading (lazy chunk, availability) the panel holds focus and
  // hands it to the heading once that renders. Not on the first render.
  const panelRef = useRef<HTMLDivElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    const panel = panelRef.current;
    if (shownStep.current === step || panel === null) return;
    shownStep.current = step;
    const focusHeading = () => {
      const heading = panel.querySelector('h2');
      if (heading === null) return false;
      heading.tabIndex = -1;
      heading.focus();
      return true;
    };
    if (focusHeading()) return;
    panel.tabIndex = -1;
    panel.focus();
    const observer = new MutationObserver(() => {
      // Only while focus is still parked on the panel: never pull it away
      // from something the guest has moved to meanwhile
      if (document.activeElement !== panel || focusHeading()) observer.disconnect();
    });
    observer.observe(panel, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [step]);

  return (
    <PageLayout script="booking" title={msg.page_booking()} footer={false}>
      <BookingStepper step={step} />
      <WizardFrame>
        {/* key remounts the wrapper per step so the CSS slide-in replays;
            enter-only on purpose — see step-in-* keyframes in styles.css */}
        <div
          key={step}
          ref={panelRef}
          className={`outline-none ${direction === 1 ? 'anim-step-forward' : 'anim-step-back'}`}
        >
          <CurrentStep state={state} step={step} />
        </div>
      </WizardFrame>
    </PageLayout>
  );
}
