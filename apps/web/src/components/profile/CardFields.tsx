import { Input, Label, TextField } from '@heroui/react';
import type { SportCardType } from '@repo/shared';
import { m } from '../../paraglide/messages.js';

const SPORT_CARDS: { value: SportCardType | null; label: string }[] = [
  { value: null, label: '' },
  { value: 'multisport', label: 'MultiSport' },
  { value: 'medicover', label: 'Medicover Sport' },
  { value: 'fitprofit', label: 'FitProfit' }
];

export interface CardsState {
  sportCardType: SportCardType | null;
  sportCardNumber: string;
  clubCardNumber: string;
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
        <p className="mb-2 text-sm text-grey-cool">{m.sport_card_label()}</p>
        <div role="group" aria-label={m.sport_card_label()} className="flex flex-wrap gap-2">
          {SPORT_CARDS.map(card => (
            <button
              key={card.value ?? 'none'}
              type="button"
              aria-pressed={value.sportCardType === card.value}
              onClick={() => onChange({ ...value, sportCardType: card.value })}
              className={`h-10 rounded-[10px] px-3 text-sm font-semibold transition-colors ${
                value.sportCardType === card.value
                  ? 'bg-golden text-btn-text'
                  : 'bg-club-green-light text-creme hover:bg-surface-hover'
              }`}
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

      <TextField
        name="clubCardNumber"
        value={value.clubCardNumber}
        onChange={clubCardNumber => onChange({ ...value, clubCardNumber })}
      >
        <Label>
          {m.club_card_label()} · {m.card_number_label()}
        </Label>
        <Input placeholder="0005" />
      </TextField>

      <p className="text-xs text-grey-cool">{m.cards_hint()}</p>
    </div>
  );
}
