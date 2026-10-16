import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { formatPln, sizeOf } from '@repo/shared';
import { useStore } from '@tanstack/react-store';
import { formatClockRange, formatDay, intlTag } from '../../lib/format';
import { useIsHydrated } from '../../lib/hydration';
import { spotDescription } from '../../lib/spots';
import { m } from '../../paraglide/messages.js';
import { WIZARD_STEPS, goToStep, stepIndex, wizardStore } from '../../store/booking-wizard';
import { WizardSummary, useWizardTotals } from './WizardSummary';

/** Where the current step puts its call to action on a wide screen. */
const ActionsSlot = createContext<HTMLElement | null>(null);

/**
 * The wizard's two columns: the step's working panel, and beside it "Your
 * booking" with the step's call to action under it. The aside stretches to
 * the panel's height and its content rides along (sticky) as the panel
 * scrolls. Below `lg` the aside goes and each step's StepActions puts the
 * same action in a bar fixed to the bottom of the screen instead.
 */
export function WizardFrame({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  return (
    <ActionsSlot value={slot}>
      <div className="grid items-stretch gap-7 pb-28 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-0">
        {/* The clip box for the step slide-in: the step enters from inside
            the panel rather than from the edge of the window */}
        <section className="min-w-0 overflow-x-clip md:panel md:p-8">{children}</section>
        <aside
          aria-label={m.summary_title()}
          className="anim-reveal hidden rounded-3xl border border-line bg-club-green-dark p-7 [animation-delay:150ms] lg:block"
        >
          <div className="sticky top-6">
            <WizardSummary />
            <div ref={setSlot} />
          </div>
        </aside>
      </div>
    </ActionsSlot>
  );
}

export interface StepAction {
  /** The full label beside the summary: "Next: table" */
  label: string;
  /** The phone bar's shorter one: "Next" */
  short: string;
  onPress?: () => void;
  /** Submit this form instead (the details step's) */
  form?: string;
  disabled?: boolean;
  pending?: boolean;
}

function ActionButton({
  action,
  label,
  className
}: {
  action: StepAction;
  label: string;
  className: string;
}) {
  const advances = action.form === undefined;
  const pending = action.pending === true;
  return (
    // While pending it refuses presses rather than going disabled: a disabled
    // button drops keyboard focus to <body>, and a refusal would leave the
    // guest nowhere. A prevented click also stops Enter in a field submitting.
    <button
      type={advances ? 'button' : 'submit'}
      form={action.form}
      onClick={event => {
        if (pending) event.preventDefault();
        else action.onPress?.();
      }}
      disabled={action.disabled === true}
      aria-disabled={pending || undefined}
      aria-busy={pending}
      className={`btn-gold ${className}`}
    >
      {action.pending ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : null}
      {label}
      {advances && !action.pending ? (
        <ArrowRight aria-hidden className="size-5" strokeWidth={2.4} />
      ) : null}
    </button>
  );
}

/**
 * The step's way forward, said twice: under the summary on a wide screen,
 * and in a bar along the bottom of a phone — with the picks so far, or on
 * the last step the total, beside it. The bar is portalled to <body> so the
 * step's slide-in transform cannot become its containing block.
 */
export function StepActions({
  action,
  back,
  note,
  bar = 'picks'
}: {
  action: StepAction;
  /** A quiet way back to the step before, under the main action */
  back?: { label: string; onPress: () => void };
  note?: ReactNode;
  bar?: 'picks' | 'total';
}) {
  const slot = useContext(ActionsSlot);
  const hydrated = useIsHydrated();
  // The phone has no summary column to carry `back`: its bar steps back one
  // step from anywhere past the first
  const step = useStore(wizardStore, state => state.step);
  const previous = WIZARD_STEPS[stepIndex(step) - 1];

  const aside = (
    <div className="mt-6 text-center">
      <ActionButton action={action} label={action.label} className="h-14 w-full text-base" />
      {back ? (
        <button
          type="button"
          onClick={back.onPress}
          className="mt-3 h-11.5 w-full rounded-[14px] text-[15px] font-semibold text-creme transition-colors hover:bg-creme/6"
        >
          ← {back.label}
        </button>
      ) : null}
      {note ? <p className="mt-4 text-[13px] leading-normal text-grey-cool">{note}</p> : null}
    </div>
  );

  const phoneBar = (
    <div className="anim-reveal fixed inset-x-0 bottom-0 z-30 border-t border-creme/14 bg-club-green-dark px-5 pt-3.5 pb-[calc(1.375rem+env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex max-w-[960px] items-center gap-3.5">
        {previous === undefined ? null : (
          <button
            type="button"
            aria-label={back?.label ?? m.btn_back()}
            onClick={() => goToStep(previous)}
            className="btn-outline size-13 flex-none border-creme/30"
          >
            <ArrowLeft aria-hidden className="size-5" strokeWidth={2.4} />
          </button>
        )}
        {bar === 'total' ? <BarTotal /> : <BarPicks />}
        <ActionButton
          action={action}
          label={action.short}
          className={`h-13 text-base ${bar === 'total' ? 'flex-1' : 'px-5.5'}`}
        />
      </div>
    </div>
  );

  return (
    <>
      {slot ? createPortal(aside, slot) : null}
      {hydrated ? createPortal(phoneBar, document.body) : null}
    </>
  );
}

/** "Table 6 · 12ft · pyramid" over "18:00–20:00 · 140 zł"; before a spot, the day and time over the estimate. */
function BarPicks() {
  const state = useStore(wizardStore);
  const totals = useWizardTotals();
  const money = formatPln(totals.total, intlTag());
  const time =
    state.startMinute === null ? null : formatClockRange(state.startMinute, state.durationMinutes);

  let title: string | null = null;
  if (state.tableLabel !== null && state.kind !== null) {
    title = spotDescription(state.kind, state.tableLabel, {
      size: state.tableId === null ? null : sizeOf(state.tableId),
      game: state.game,
      lowercaseGame: true
    });
  } else if (state.date !== null) {
    title = time ? `${formatDay(state.date)} · ${time}` : formatDay(state.date);
  }

  return (
    <div className="min-w-0 flex-1">
      {title ? <p className="truncate text-sm font-bold first-letter:uppercase">{title}</p> : null}
      <p className="mt-0.5 truncate text-[13px] text-golden-light tabular-nums">
        {totals.estimate
          ? m.summary_from({ price: money })
          : `${time ?? ''}${time ? ' · ' : ''}${money}`}
      </p>
    </div>
  );
}

function BarTotal() {
  const totals = useWizardTotals();
  return (
    <div className="flex-none">
      <p className="text-xs font-bold tracking-[0.12em] text-grey-cool uppercase">{m.total()}</p>
      <p className="mt-0.5 text-[22px] leading-tight font-bold text-golden tabular-nums">
        {formatPln(totals.total, intlTag())}
      </p>
    </div>
  );
}
