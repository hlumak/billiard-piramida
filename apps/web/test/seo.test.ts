import { expect, test } from 'vitest';
import { clampDescription, DESCRIPTION_MAX_CHARS } from '../src/lib/seo';

test('a short description is kept, with its spacing tidied', () => {
  expect(clampDescription('Cztery nowe stoły 12ft — rezerwuj online już dziś.')).toBe(
    'Cztery nowe stoły 12ft — rezerwuj online już dziś.'
  );
  expect(clampDescription('  Two brackets,\n\nbest of   three  ')).toBe(
    'Two brackets, best of three'
  );
});

test('a long description is cut at a whole word and fits a phone result', () => {
  const long =
    'Two brackets, lower and upper, races to three; the final is a race to five, and the entry fee covers table time for every match you play on the night.';
  const clamped = clampDescription(long);
  expect(clamped.length).toBeLessThanOrEqual(DESCRIPTION_MAX_CHARS);
  expect(clamped.endsWith('…')).toBe(true);
  expect(long.startsWith(clamped.slice(0, -1))).toBe(true);
  // The cut lands between words, never inside one
  expect(long[clamped.length - 1]).toMatch(/[\s,;]/);
});

test('trailing punctuation before the ellipsis goes', () => {
  const clamped = clampDescription(`${'word '.repeat(22)}end, of the line goes on`);
  expect(clamped).not.toMatch(/[,\s]…$/);
});

test('one endless word is still cut to length', () => {
  const clamped = clampDescription('x'.repeat(300));
  expect(clamped).toHaveLength(DESCRIPTION_MAX_CHARS);
});
