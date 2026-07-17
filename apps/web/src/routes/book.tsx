import { useEffect, useRef } from 'react';
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
import { DetailsStep } from '../components/wizard/DetailsStep';
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
  if (index > stepIndex('table') && state.tableId == null) return 'table';
  return state.step;
}

/**
 * Single narrowing point: each step only renders when its prerequisites exist,
 * so the steps receive non-null props instead of asserting store fields.
 */
function CurrentStep({ state, step }: { state: WizardState; step: WizardStep }) {
  const { date, startHour, durationHours, tableId } = state;
  if (step === 'date' || date == null) return <DateStep />;
  if (step === 'time' || startHour == null) return <TimeStep date={date} />;
  if (step === 'table' || tableId == null) {
    return <TableStep date={date} startHour={startHour} durationHours={durationHours} />;
  }
  if (step === 'food') return <FoodStep />;
  return <DetailsStep draft={{ date, startHour, durationHours, tableId }} />;
}

function BookingWizard() {
  const navigate = useNavigate();
  const state = useStore(wizardStore);

  // Drop an abandoned wizard whose date has since passed (client-only mutation)
  useEffect(() => {
    resetIfDateStale(warsawToday());
  }, []);

  const step = permittedStep(state);

  useEffect(() => {
    if (step !== state.step) goToStep(step);
  }, [step, state.step]);

  const index = stepIndex(step);
  const previousIndex = useRef(index);
  const direction = index >= previousIndex.current ? 1 : -1;
  useEffect(() => {
    previousIndex.current = index;
  }, [index]);

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
      {/* Clip box extends into the page padding so input focus rings aren't shaved off */}
      <main className="-mx-6 mt-8 flex-1 overflow-x-clip px-6">
        {/* key remounts the wrapper per step so the CSS slide-in replays;
            enter-only on purpose — see step-in-* keyframes in styles.css */}
        <div key={step} className={direction === 1 ? 'anim-step-forward' : 'anim-step-back'}>
          <CurrentStep state={state} step={step} />
        </div>
      </main>
    </div>
  );
}
