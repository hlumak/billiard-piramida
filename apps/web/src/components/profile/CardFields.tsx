import { Input, Label, TextField } from '@heroui/react';
import type { SportCardType } from '@repo/shared';
import { m } from '../../paraglide/messages.js';
import { PartnerCardLogos } from '../PartnerCardLogos';

const SPORT_CARDS: { value: SportCardType | null; label: string }[] = [
  { value: null, label: '' },
  { value: 'multisport', label: 'MultiSport' },
  { value: 'medicover', label: 'Medicover Sport' },
  { value: 'fitprofit', label: 'FitProfit' }
];

export interface CardsState {
  sportCardType: SportCardType | null;
  sportCardNumber: string;
}

/** Sport-card chips + numbers — shared by registration and profile editing. */
export function CardFields({
  value,
  onChange
}: {
  value: CardsState;
  onChange: (next: CardsState) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2.5 text-sm font-semibold">{m.sport_card_label()}</p>
        <div role="group" aria-label={m.sport_card_label()} className="flex flex-wrap gap-2">
          {SPORT_CARDS.map(card => (
            <button
              key={card.value ?? 'none'}
              type="button"
              aria-pressed={value.sportCardType === card.value}
              onClick={() => onChange({ ...value, sportCardType: card.value })}
              className="chip h-11 px-4 text-sm"
            >
              {card.label || m.sport_card_none()}
            </button>
          ))}
        </div>
      </div>

      {value.sportCardType !== null ? (
        <TextField
          name="sportCardNumber"
          value={value.sportCardNumber}
          onChange={sportCardNumber => onChange({ ...value, sportCardNumber })}
        >
          <Label>
            {m.sport_card_label()} · {m.card_number_label()}
          </Label>
          <Input placeholder="MS-000000" />
        </TextField>
      ) : null}

      <PartnerCardLogos />
      <p className="text-[13px] text-grey-cool">{m.cards_hint()}</p>
    </div>
  );
}
