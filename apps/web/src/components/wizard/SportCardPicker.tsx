import { Button } from '@heroui/react';
import { Minus, Plus } from 'lucide-react';
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
  onChange
}: {
  count: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="rounded-[10px] bg-club-green-light p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold text-creme">{m.sport_cards_label()}</p>
        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label={`${m.sport_cards_label()} −`}
            isDisabled={count <= 0}
            className="border-golden text-creme"
            onPress={() => onChange(count - 1)}
          >
            <Minus className="size-4" />
          </Button>
          <output
            aria-live="polite"
            className="min-w-8 text-center text-lg font-bold tabular-nums text-golden"
          >
            {count}
          </output>
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label={`${m.sport_cards_label()} +`}
            isDisabled={count >= max}
            className="border-golden text-creme"
            onPress={() => onChange(count + 1)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <PartnerCardLogos className="mt-3" />
      <p className="mt-3 text-xs text-grey-cool">{m.sport_cards_hint()}</p>
    </div>
  );
}
