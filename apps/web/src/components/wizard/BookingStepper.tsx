import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { m } from '../../paraglide/messages.js';
import { WIZARD_STEPS, goToStep, stepIndex, type WizardStep } from '../../store/booking-wizard';

const LABELS: Record<WizardStep, () => string> = {
  when: m.step_when,
  table: m.step_spot,
  food: m.step_bar,
  details: m.step_contacts
};

/**
 * Where the guest is in the four steps, by name. Steps already done are
 * buttons back to themselves (the picks stay); the ones ahead are not
 * reachable from here. A phone gets the compact form: "Step 2 of 4 · Table"
 * over four bars, with the done steps' names as the way back.
 */
export function BookingStepper({ step }: { step: WizardStep }) {
  const current = stepIndex(step);

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
        {/* Steps already done take the guest back to them, as on a wide screen */}
        <div className="mt-0.5 grid grid-cols-4 gap-1.5 text-[11px] font-semibold text-grey-cool">
          {WIZARD_STEPS.map((entry, index) =>
            index < current ? (
              <button
                key={entry}
                type="button"
                onClick={() => goToStep(entry)}
                className="py-1 text-left text-cream-soft underline decoration-creme/40 underline-offset-2"
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
          const badge = done ? (
            <span className="flex size-8 items-center justify-center rounded-full bg-club-green-light text-golden">
              <Check className="size-4" strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <span
              className={`flex size-8 items-center justify-center rounded-full text-sm ${
                isCurrent
                  ? 'bg-golden font-bold text-btn-text'
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
                  done || isCurrent ? 'text-creme' : 'text-grey-cool'
                }`}
              >
                {done ? (
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
