import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLUB_CARD_DISCOUNT_PERCENT,
  discountGroszFor,
  HOURLY_RATE_GROSZ,
  SPORT_CARD_DISCOUNT_GROSZ
} from '../src/pricing.ts';

const total = 2 * HOURLY_RATE_GROSZ; // 80 PLN table rental

test('no cards → no discount', () => {
  assert.equal(discountGroszFor({ sportCardType: null, clubCardNumber: null }, total), 0);
});

test('blank card fields are treated as no card', () => {
  // Lenient clients / legacy rows may send '' for an untouched field — it must
  // never earn a discount (regression test for the 10%-without-a-card bug).
  assert.equal(discountGroszFor({ sportCardType: '', clubCardNumber: '' }, total), 0);
  assert.equal(discountGroszFor({ sportCardType: null, clubCardNumber: '   ' }, total), 0);
});

test('club card gives a percentage of the table rental', () => {
  assert.equal(
    discountGroszFor({ sportCardType: null, clubCardNumber: '0005' }, total),
    Math.round((total * CLUB_CARD_DISCOUNT_PERCENT) / 100)
  );
});

test('sport card gives a flat discount', () => {
  assert.equal(
    discountGroszFor({ sportCardType: 'multisport', clubCardNumber: null }, total),
    SPORT_CARD_DISCOUNT_GROSZ
  );
});

test('the larger of the two discounts applies (no stacking)', () => {
  // At 80 PLN: club 10% = 8 PLN vs sport flat 15 PLN → sport wins.
  const both = discountGroszFor({ sportCardType: 'multisport', clubCardNumber: '0005' }, total);
  assert.equal(both, SPORT_CARD_DISCOUNT_GROSZ);
});

test('discount never exceeds the table rental', () => {
  const tiny = 5_00; // 5 PLN rental, sport flat discount is 15 PLN
  assert.equal(discountGroszFor({ sportCardType: 'multisport', clubCardNumber: null }, tiny), tiny);
});
