import { SPORT_CARD_DISCOUNT_GROSZ, formatPln } from '@repo/shared';
import { intlTag } from '../lib/format';
import { m } from '../paraglide/messages.js';
import { PartnerCardLogos } from './PartnerCardLogos';

/** The sport-card discount on a sunken band: the amount, the rule, the partners. */
export function SportCardsBand() {
  return (
    <section className="panel mt-3 grid items-center gap-3 rounded-[18px] p-5 md:mt-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-8 md:rounded-[20px] md:px-8 md:py-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-golden-light">
          {m.partner_cards_title()}
        </p>
        <p className="mt-1.5 text-3xl leading-none font-bold whitespace-nowrap text-golden md:text-[38px]">
          −{formatPln(SPORT_CARD_DISCOUNT_GROSZ, intlTag())}
        </p>
      </div>
      <p className="text-sm leading-relaxed text-cream-soft md:text-[15px]">
        {m.sport_cards_hint()}
      </p>
      <PartnerCardLogos />
    </section>
  );
}
