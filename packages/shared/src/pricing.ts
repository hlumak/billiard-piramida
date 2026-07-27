import type { ActivityKind } from './types.ts';

/** All money amounts are integer grosze (1 PLN = 100 gr). */

/** Hourly rate per bookable spot kind. */
export const HOURLY_RATE_GROSZ = {
  billiard: 50_00,
  darts: 30_00
} as const satisfies Record<ActivityKind, number>;

/** Max quantity per order line (the API rejects more; the UI caps at this). */
export const MAX_ORDER_ITEM_QUANTITY = 50;

export const CURRENCY = 'PLN';

export function spotPriceGrosz(kind: ActivityKind, durationHours: number): number {
  return durationHours * HOURLY_RATE_GROSZ[kind];
}

/**
 * Partner sport card (FitProfit / Medicover Sport / MultiSport): a flat amount
 * off the spot rental, once per card per day. Cards stack — every partner on
 * the booking may put their own card in.
 */
export const SPORT_CARD_DISCOUNT_GROSZ = 15_00;

/**
 * The policy itself sets no ceiling on cards per booking, but an unbounded
 * integer off a public endpoint is not something to hand to the pricing math —
 * this bounds both the API schema and the UI stepper. Well above any real
 * group size around one table.
 */
export const MAX_SPORT_CARDS_PER_BOOKING = 10;

/**
 * Never exceeds the spot rental itself: two cards on a 30 zł/h dartboard make
 * the hour free, not negative, and food is never discounted.
 */
export function discountGroszFor(sportCardCount: number, spotTotalGrosz: number): number {
  if (!Number.isInteger(sportCardCount) || sportCardCount <= 0) return 0;
  const cards = Math.min(sportCardCount, MAX_SPORT_CARDS_PER_BOOKING);
  return Math.min(cards * SPORT_CARD_DISCOUNT_GROSZ, Math.max(spotTotalGrosz, 0));
}

export function formatPln(grosz: number, locale: Intl.LocalesArgument): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: grosz % 100 === 0 ? 0 : 2
  }).format(grosz / 100);
}
