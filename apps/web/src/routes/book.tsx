import { Suspense, lazy, useEffect, useRef } from 'react';
import { Spinner } from '@heroui/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { m as msg } from '../paraglide/messages.js';
import { noindexMeta } from '../lib/seo';
import { warsawToday } from '../lib/format';
import { PageHeader } from '../components/AppHeader';
import { WizardProgress } from '../components/WizardProgress';
import { DateStep } from '../components/wizard/DateStep';
import { TimeStep } from '../components/wizard/TimeStep';
import { TableStep } from '../components/wizard/TableStep';
import { FoodStep } from '../components/wizard/FoodStep';

/**
 * The last step carries the phone field and libphonenumber's metadata — about
 * 60 kB gzip that only step 5 uses. Loaded on demand (and prefetched as soon
 * as the guest reaches the table step) instead of with step 1.
 */
const loadDetailsStep = () => import('../components/wizard/DetailsStep');
const DetailsStep = lazy(() => loadDetailsStep().then(module => ({ default: module.DetailsStep })));
import {
  WIZARD_STEPS,
  goToStep,
  resetIfDateStale,
  stepIndex,
  wizardStore,
  type WizardState,
  type WizardStep
} from '../store/booking-wizard';

export const Route = createFileRoute('/book')({
  head: () => ({ meta: noindexMeta(msg.seo_title_book()) }),
  component: BookingWizard
});

/**
 * Clamp forward jumps to the first step whose prerequisites are missing.
 * Never pushes forward: standing on an earlier step (e.g. going back to
 * change the date) is always valid.
 */
function permittedStep(state: WizardState): WizardStep {
  const index = stepIndex(state.step);
  if (index > stepIndex('date') && state.date == null) return 'date';
  if (index > stepIndex('time') && state.startHour == null) return 'time';
  if (index > stepIndex('table') && (state.tableId == null || state.kind == null)) return 'table';
  return state.step;
}

/**
 * Single narrowing point: each step only renders when its prerequisites exist,
 * so the steps receive non-null props instead of asserting store fields.
 */
function CurrentStep({ state, step }: { state: WizardState; step: WizardStep }) {
  const { date, startHour, durationHours, tableId, kind, tableLabel, game } = state;
  if (step === 'date' || date == null) return <DateStep />;
  if (step === 'time' || startHour == null) return <TimeStep date={date} />;
  // `kind` is written together with `tableId`, so a spot without one can only
  // be a stale store from before darts existed — send them back to re-pick.
  if (step === 'table' || tableId == null || kind == null || tableLabel == null) {
    return <TableStep date={date} startHour={startHour} durationHours={durationHours} />;
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
      <DetailsStep draft={{ date, startHour, durationHours, tableId, kind, tableLabel, game }} />
    </Suspense>
  );
}

function BookingWizard() {
  const navigate = useNavigate();
  const state = useStore(wizardStore);

  // Drop an abandoned wizard whose date has since passed (client-only mutation)
  useEffect(() => {
    resetIfDateStale(warsawToday());
  }, []);

  const step = permittedStep(state);
  // The store carries the direction of the last step change, so a mid-step
  // update (adding a menu item on the food step) can't flip the wrapper's
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

  const index = stepIndex(step);

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

  const handleBack = () => {
    const previous = WIZARD_STEPS[index - 1];
    if (previous === undefined) {
      navigate({ to: '/' });
    } else {
      goToStep(previous);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="booking" onBack={handleBack} />
      <WizardProgress step={index + 1} total={WIZARD_STEPS.length} />
      <main id="main" className="mt-8 flex-1">
        {/* Every step shares one sunken panel: the darker ground marks off the
            wizard's working area and gives the club-green-light option buttons
            something to lift from. It is also the clip box — the step slide-in
            is contained by the panel rather than by the viewport — and its own
            padding keeps input focus rings well clear of that clipped edge. */}
        <div className="overflow-x-clip rounded-3xl bg-club-green-dark p-4 md:p-6">
          {/* key remounts the wrapper per step so the CSS slide-in replays;
              enter-only on purpose — see step-in-* keyframes in styles.css */}
          <div
            key={step}
            ref={panelRef}
            className={`outline-none ${direction === 1 ? 'anim-step-forward' : 'anim-step-back'}`}
          >
            <CurrentStep state={state} step={step} />
          </div>
        </div>
      </main>
    </div>
  );
}
