import { Minus, Plus } from 'lucide-react';
import { formatPln, SPORT_CARD_DISCOUNT_GROSZ } from '@repo/shared';
import { intlTag } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { PartnerCardLogos } from '../PartnerCardLogos';

/**
 * How many partner sport cards the group will present. Guests can claim them
 * too — the discount belongs to the players at the spot, not to an account, and
 * staff check the physical cards at reception.
 */
export function SportCardPicker({
  count,
  max,
  onChange,
  className = ''
}: {
  count: number;
  max: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  const round =
    'flex size-11 items-center justify-center rounded-full border-[1.5px] transition-[background-color,transform] duration-150 hover:bg-creme/6 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';
  return (
    <section className={`rounded-2xl bg-card p-4.5 md:px-5.5 md:py-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 md:gap-4">
        <div>
          <h3 className="font-bold">{m.sport_cards_label()}</h3>
          <p className="mt-0.5 text-[13px] text-grey-cool md:mt-1 md:text-sm">
            {m.sport_cards_each({ amount: formatPln(SPORT_CARD_DISCOUNT_GROSZ, intlTag()) })}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2.5 md:gap-3.5">
          <button
            type="button"
            aria-label={`${m.sport_cards_label()} −`}
            disabled={count <= 0}
            onClick={() => onChange(count - 1)}
            className={`${round} border-creme/35 text-creme`}
          >
            <Minus aria-hidden className="size-5" />
          </button>
          <output
            aria-live="polite"
            className="min-w-5 text-center text-[22px] font-bold text-golden tabular-nums"
          >
            {count}
          </output>
          <button
            type="button"
            aria-label={`${m.sport_cards_label()} +`}
            disabled={count >= max}
            onClick={() => onChange(count + 1)}
            className={`${round} border-golden text-golden`}
          >
            <Plus aria-hidden className="size-5" />
          </button>
        </div>
      </div>

      <PartnerCardLogos className="mt-3.5 md:mt-4" />
      <p className="mt-3.5 text-[13px] leading-normal text-grey-cool">{m.sport_cards_check()}</p>
    </section>
  );
}
