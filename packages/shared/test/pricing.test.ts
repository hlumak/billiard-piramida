import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  discountGroszFor,
  hourlyRateGrosz,
  HOURLY_RATE_GROSZ,
  MAX_SPORT_CARDS_PER_BOOKING,
  spotPriceGrosz,
  SPORT_CARD_DISCOUNT_GROSZ
} from '../src/pricing.ts';
import { SPOTS } from '../src/venue.ts';

/** Spot 1 is a 9ft table, spot 8 a 12ft one, spot 6 a dartboard — see SPOTS. */
const table9ft = { id: 1, kind: 'billiard' } as const;
const table12ft = { id: 8, kind: 'billiard' } as const;
const dartboard = { id: 6, kind: 'darts' } as const;

const billiardHour = HOURLY_RATE_GROSZ['9ft'];
const dartsHour = HOURLY_RATE_GROSZ.darts;

test('rates are per rate tier, and billiard tiers split by cloth size', () => {
  assert.equal(HOURLY_RATE_GROSZ['9ft'], 50_00);
  assert.equal(HOURLY_RATE_GROSZ['12ft'], 70_00);
  assert.equal(dartsHour, 30_00);
  assert.equal(spotPriceGrosz(table9ft, 3), 150_00);
  assert.equal(spotPriceGrosz(table12ft, 3), 210_00);
  assert.equal(spotPriceGrosz(dartboard, 2), 60_00);
});

test('the venue bills tables 1-5 at 9ft and 6-9 at 12ft', () => {
  const rateByLabel = new Map<string, number>(
    SPOTS.filter(spot => spot.kind === 'billiard').map(spot => [spot.label, hourlyRateGrosz(spot)])
  );
  for (const label of ['1', '2', '3', '4', '5']) {
    assert.equal(rateByLabel.get(label), 50_00, `table ${label}`);
  }
  for (const label of ['6', '7', '8', '9']) {
    assert.equal(rateByLabel.get(label), 70_00, `table ${label}`);
  }
});

test('a billiard table missing from SPOTS falls back to the 9ft rate', () => {
  assert.equal(hourlyRateGrosz({ id: 999, kind: 'billiard' }), HOURLY_RATE_GROSZ['9ft']);
  assert.equal(hourlyRateGrosz({ id: 999, kind: 'darts' }), HOURLY_RATE_GROSZ.darts);
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
  const threeHours = spotPriceGrosz(table9ft, 3);
  assert.equal(discountGroszFor(1, threeHours), SPORT_CARD_DISCOUNT_GROSZ);
  assert.equal(discountGroszFor(2, threeHours), 2 * SPORT_CARD_DISCOUNT_GROSZ);
});

test('policy examples', () => {
  // One 9ft hour: 50 − 15 = 35 PLN
  assert.equal(billiardHour - discountGroszFor(1, billiardHour), 35_00);
  // The owner's worked example: four players with a card each take a 9ft table
  // for four hours — 4 × 50 = 200, less 4 × 15, so 140, i.e. 35 each.
  const fourHours = spotPriceGrosz(table9ft, 4);
  assert.equal(fourHours - discountGroszFor(4, fourHours), 140_00);
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
