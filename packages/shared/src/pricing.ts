import type { ActivityKind } from './types.ts';
import { sizeOf, type TableSize } from './venue.ts';

/** All money amounts are integer grosze (1 PLN = 100 gr). */

/**
 * What a spot bills at. Billiard tables are NOT one rate: the 9-foot tables in
 * hall 1 and the 12-foot tables in hall 2 are priced apart, which is why the
 * tier comes from the table's size and not from its kind.
 */
export type RateTier = TableSize | 'darts';

/** What each rate tier bills per hour, in grosze. */
export type RateTable = Record<RateTier, number>;

/**
 * The rates the club opened with. These are only the seed for `venue_rates` and
 * a display-side fallback — the database row is the price a booking is written
 * at, so the owner can reprice without a deploy.
 */
export const DEFAULT_HOURLY_RATE_GROSZ: RateTable = {
  '9ft': 50_00,
  '12ft': 70_00,
  darts: 30_00
};

/** Ceiling on an hourly rate, in grosze — bounds the admin schema. */
export const MAX_HOURLY_RATE_GROSZ = 1_000_00;

/** Max quantity per order line (the API rejects more; the UI caps at this). */
export const MAX_ORDER_ITEM_QUANTITY = 50;

export const CURRENCY = 'PLN';

/** Enough of a spot to price it — the id resolves the size, the kind is the fallback. */
export interface SpotRef {
  id: number;
  kind: ActivityKind;
}

/**
 * Sizes live in SPOTS, not on the DB row, so a billiard table missing there —
 * only reachable if the seed and the venue definition drift — bills at the
 * cheaper 9ft rate instead of throwing in the middle of a booking.
 */
export function rateTierOf(spot: SpotRef): RateTier {
  if (spot.kind === 'darts') return 'darts';
  return sizeOf(spot.id) ?? '9ft';
}

export function hourlyRateGrosz(spot: SpotRef, rates: RateTable): number {
  return rates[rateTierOf(spot)];
}

export function spotPriceGrosz(spot: SpotRef, durationHours: number, rates: RateTable): number {
  return durationHours * hourlyRateGrosz(spot, rates);
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
