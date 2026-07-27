import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  discountGroszFor,
  HOURLY_RATE_GROSZ,
  MAX_SPORT_CARDS_PER_BOOKING,
  spotPriceGrosz,
  SPORT_CARD_DISCOUNT_GROSZ
} from '../src/pricing.ts';

const billiardHour = HOURLY_RATE_GROSZ.billiard;
const dartsHour = HOURLY_RATE_GROSZ.darts;

test('rates are per spot kind', () => {
  assert.equal(billiardHour, 50_00);
  assert.equal(dartsHour, 30_00);
  assert.equal(spotPriceGrosz('billiard', 3), 150_00);
  assert.equal(spotPriceGrosz('darts', 2), 60_00);
});

test('no cards → no discount', () => {
  assert.equal(discountGroszFor(0, billiardHour), 0);
});

test('non-counts are treated as no card', () => {
  // Lenient clients / legacy rows may send junk — none of it may earn a
  // discount (regression test for the discount-without-a-card bug).
  assert.equal(discountGroszFor(-3, billiardHour), 0);
  assert.equal(discountGroszFor(1.5, billiardHour), 0);
  assert.equal(discountGroszFor(Number.NaN, billiardHour), 0);
});

test('each card takes a flat amount off, and they stack', () => {
  const threeHours = spotPriceGrosz('billiard', 3);
  assert.equal(discountGroszFor(1, threeHours), SPORT_CARD_DISCOUNT_GROSZ);
  assert.equal(discountGroszFor(2, threeHours), 2 * SPORT_CARD_DISCOUNT_GROSZ);
});

test('policy examples', () => {
  // One standard hour: 50 − 15 = 35 PLN
  assert.equal(billiardHour - discountGroszFor(1, billiardHour), 35_00);
  // One darts hour, one card: 30 − 15 = 15 PLN
  assert.equal(dartsHour - discountGroszFor(1, dartsHour), 15_00);
  // One darts hour, two partners with a card each: 30 − 15 − 15 = 0 PLN
  assert.equal(dartsHour - discountGroszFor(2, dartsHour), 0);
});

test('discount never exceeds the spot rental', () => {
  // Three cards on a single 30 PLN darts hour still bottoms out at free.
  assert.equal(discountGroszFor(3, dartsHour), dartsHour);
  assert.equal(discountGroszFor(99, billiardHour), billiardHour);
});

test('card count is clamped to the per-booking ceiling', () => {
  const plenty = 1000_00;
  assert.equal(
    discountGroszFor(MAX_SPORT_CARDS_PER_BOOKING + 5, plenty),
    MAX_SPORT_CARDS_PER_BOOKING * SPORT_CARD_DISCOUNT_GROSZ
  );
});
