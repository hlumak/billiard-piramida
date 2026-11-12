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

/**
 * Max dishes and drinks a guest can put on one booking online, all lines
 * together. Without it one booking could take order lines without end. Staff
 * are not held to it: a big party's tab is theirs to run.
 */
export const MAX_ORDER_UNITS_PER_BOOKING = 200;

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

/**
 * Rental for a stretch of time at an hourly rate: a half hour bills half the
 * hour. Rounded to the grosz, so an odd rate cannot produce half a grosz.
 */
export function rentalGrosz(ratePerHourGrosz: number, durationMinutes: number): number {
  return Math.round((ratePerHourGrosz * durationMinutes) / 60);
}

export function spotPriceGrosz(spot: SpotRef, durationMinutes: number, rates: RateTable): number {
  return rentalGrosz(hourlyRateGrosz(spot, rates), durationMinutes);
}

/**
 * Partner sport card (FitProfit / Medicover Sport / MultiSport): a flat amount
 * off one hour at one spot, once per card per day — "one spot, one hour, one
 * card". Online that means one card per full hour booked
 * (`maxSportCardsOnline`); the desk may put in more after checking the cards.
 */
export const SPORT_CARD_DISCOUNT_GROSZ = 15_00;

/**
 * Hard bound on cards per booking for the desk, which settles disputes at
 * reception: an unbounded integer is not something to hand to the pricing
 * math. Guests booking online get the tighter `maxSportCardsOnline`.
 */
export const MAX_SPORT_CARDS_PER_BOOKING = 10;

/**
 * Cards a guest may claim online: one per full hour, so 1 h and 1:30 take one
 * card, 2 h and 2:30 take two. Guests stacked four cards on one hour and
 * expected to play free; the club's rule is one card per hour at one spot.
 */
export function maxSportCardsOnline(durationMinutes: number): number {
  return Math.min(Math.max(Math.floor(durationMinutes / 60), 0), MAX_SPORT_CARDS_PER_BOOKING);
}

/**
 * Never exceeds the spot rental itself: two cards on a 30 zł/h dartboard make
 * the hour free, not negative, and food is never discounted.
 */
export function discountGroszFor(sportCardCount: number, spotTotalGrosz: number): number {
  if (!Number.isInteger(sportCardCount) || sportCardCount <= 0) return 0;
  const cards = Math.min(sportCardCount, MAX_SPORT_CARDS_PER_BOOKING);
  return Math.min(cards * SPORT_CARD_DISCOUNT_GROSZ, Math.max(spotTotalGrosz, 0));
}

/** Intl formatters are costly to build and lists format a price per row on every poll. */
const plnFormatters = new Map<string, Intl.NumberFormat>();

export function formatPln(grosz: number, locale: Intl.LocalesArgument): string {
  const fractionDigits = grosz % 100 === 0 ? 0 : 2;
  const key = `${String(locale)}|${fractionDigits}`;
  let formatter = plnFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: CURRENCY,
      minimumFractionDigits: fractionDigits
    });
    plnFormatters.set(key, formatter);
  }
  return formatter.format(grosz / 100);
}
