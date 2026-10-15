import { Fragment } from 'react';
import { useStore } from '@tanstack/react-store';
import { Check } from 'lucide-react';
import { m } from '../../paraglide/messages.js';
import {
  WIZARD_STEPS,
  furthestStep,
  goToStep,
  stepIndex,
  wizardStore,
  type WizardStep
} from '../../store/booking-wizard';

const LABELS: Record<WizardStep, () => string> = {
  when: m.step_when,
  table: m.step_spot,
  food: m.step_bar,
  details: m.step_contacts
};

/**
 * Where the guest is in the four steps, by name. Steps already done are
 * buttons back to themselves (the picks stay), and so are the ones ahead the
 * guest has already been on, while the picks they need still stand; the rest
 * ahead are not reachable from here. A phone gets the compact form: "Step 2
 * of 4 · Table" over four bars, with the reachable steps' names as links.
 */
export function BookingStepper({ step }: { step: WizardStep }) {
  const current = stepIndex(step);
  const furthest = useStore(wizardStore, furthestStep);
  const reachable = (index: number) => index !== current && index <= furthest;

  return (
    <nav aria-label={m.booking_steps()} className="mx-auto mb-7 w-full max-w-[760px] md:mb-9">
      <div className="md:hidden">
        <p className="text-[13px] font-bold tracking-[0.2em] text-cream-soft uppercase">
          {m.step_of({ step: current + 1, total: WIZARD_STEPS.length })} · {LABELS[step]()}
        </p>
        <div aria-hidden className="mt-2.5 grid grid-cols-4 gap-1.5">
          {WIZARD_STEPS.map((entry, index) => (
            <span
              key={entry}
              className={`h-1 rounded-full transition-colors duration-300 ${
                index <= current ? 'bg-golden' : 'bg-creme/20'
              }`}
            />
          ))}
        </div>
        {/* Steps already been on take the guest to them, as on a wide screen */}
        <div className="mt-0.5 grid grid-cols-4 gap-1.5 text-[11px] font-semibold text-grey-cool">
          {WIZARD_STEPS.map((entry, index) =>
            reachable(index) ? (
              <button
                key={entry}
                type="button"
                onClick={() => goToStep(entry)}
                // 44px to tap, laid out as the 24px row the other names take
                className="-my-2.5 py-3.5 text-left text-cream-soft underline decoration-creme/40 underline-offset-2"
              >
                {LABELS[entry]()}
              </button>
            ) : (
              <span
                key={entry}
                aria-hidden
                className={`py-1 ${entry === step ? 'text-golden-light' : ''}`}
              >
                {LABELS[entry]()}
              </span>
            )
          )}
        </div>
      </div>

      <ol className="hidden items-center gap-3 md:flex">
        {WIZARD_STEPS.map((entry, index) => {
          const done = index < current;
          const isCurrent = index === current;
          // Ahead of this step, but the guest has been there and can go back
          const open = reachable(index);
          const badge = done ? (
            <span className="flex size-8 items-center justify-center rounded-full bg-club-green-light text-golden">
              <Check className="size-4" strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <span
              className={`flex size-8 items-center justify-center rounded-full text-sm ${
                isCurrent
                  ? 'bg-golden font-bold text-btn-text'
                  : open
                    ? 'shadow-[inset_0_0_0_1.5px_var(--color-golden)]'
                    : 'shadow-[inset_0_0_0_1.5px_rgb(246_241_220/0.35)]'
              }`}
            >
              {index + 1}
            </span>
          );
          return (
            <Fragment key={entry}>
              {index > 0 ? (
                <li aria-hidden className="h-0.5 flex-1 overflow-hidden rounded-full bg-creme/18">
                  <span
                    className={`block h-full origin-left bg-golden transition-transform duration-500 ${
                      index <= current ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </li>
              ) : null}
              <li
                aria-current={isCurrent ? 'step' : undefined}
                className={`text-[15px] ${isCurrent ? 'font-bold' : 'font-semibold'} ${
                  done || isCurrent || open ? 'text-creme' : 'text-grey-cool'
                }`}
              >
                {open ? (
                  <button
                    type="button"
                    onClick={() => goToStep(entry)}
                    className="flex items-center gap-2.5 rounded-lg transition-colors hover:text-golden"
                  >
                    {badge}
                    {LABELS[entry]()}
                  </button>
                ) : (
                  <span className="flex items-center gap-2.5">
                    {badge}
                    {LABELS[entry]()}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
