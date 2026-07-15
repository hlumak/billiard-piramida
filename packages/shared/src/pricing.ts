/** All money amounts are integer grosze (1 PLN = 100 gr). */
export const HOURLY_RATE_GROSZ = 40_00;

export const CURRENCY = 'PLN';

export function tablePriceGrosz(durationHours: number): number {
  return durationHours * HOURLY_RATE_GROSZ;
}

/** Sport card (MultiSport / Medicover / FitProfit): flat discount per booking. */
export const SPORT_CARD_DISCOUNT_GROSZ = 15_00;
/** Club card (regulars): percentage off the table rental. */
export const CLUB_CARD_DISCOUNT_PERCENT = 10;

export interface DiscountCards {
  sportCardType: string | null;
  clubCardNumber: string | null;
}

/**
 * The better of the two discounts applies — they don't stack.
 * Never exceeds the table rental itself.
 */
export function discountGroszFor(cards: DiscountCards, tableTotalGrosz: number): number {
  const sport = cards.sportCardType !== null ? SPORT_CARD_DISCOUNT_GROSZ : 0;
  const club =
    cards.clubCardNumber !== null
      ? Math.round((tableTotalGrosz * CLUB_CARD_DISCOUNT_PERCENT) / 100)
      : 0;
  return Math.min(Math.max(sport, club), tableTotalGrosz);
}

export function formatPln(grosz: number, locale: Intl.LocalesArgument): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: grosz % 100 === 0 ? 0 : 2
  }).format(grosz / 100);
}
