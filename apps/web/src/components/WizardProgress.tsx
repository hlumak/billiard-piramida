import { m } from '../paraglide/messages.js';

export function WizardProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="mt-5">
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={m.step_of({ step, total })}
        className="h-2 w-full overflow-hidden rounded-[3px] bg-deep-cream"
      >
        {/* Width is the only thing that animates here, so name it. Tailwind has
            no `transition-width` utility — the arbitrary property is the way to
            avoid `transition-all` sweeping in every other changed property. */}
        <div
          className="h-full rounded-[3px] bg-golden transition-[width] duration-300"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
      <p className="font-alt mt-1.5 text-xs text-creme">{m.step_of({ step, total })}</p>
    </div>
  );
}
