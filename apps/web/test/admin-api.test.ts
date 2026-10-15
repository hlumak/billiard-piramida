import { expect, test } from 'vitest';
import { normalizePhoneSearch } from '../src/lib/admin-api';

test('a typed phone keeps its digits and plus, nothing else', () => {
  expect(normalizePhoneSearch('601 234 567')).toBe('601234567');
  expect(normalizePhoneSearch('+48 601-234-567')).toBe('+48601234567');
  expect(normalizePhoneSearch('(601) 234 567')).toBe('601234567');
  expect(normalizePhoneSearch('+48601234567')).toBe('+48601234567');
  expect(normalizePhoneSearch('')).toBe('');
});
