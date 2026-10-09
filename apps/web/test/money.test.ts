import { describe, expect, test } from 'vitest';
import { MAX_PRICE_GROSZ, parseZloty } from '../src/lib/money';

describe('parseZloty', () => {
  test('blank is null — never a free 0 zł', () => {
    expect(parseZloty('')).toBeNull();
    expect(parseZloty('   ')).toBeNull();
  });

  test('accepts a comma or a dot and rounds to grosze', () => {
    expect(parseZloty('25')).toBe(2500);
    expect(parseZloty('25,50')).toBe(2550);
    expect(parseZloty(' 12.345 ')).toBe(1235);
    expect(parseZloty('0')).toBe(0);
  });

  test('rejects garbage, negatives and amounts above the cap', () => {
    expect(parseZloty('abc')).toBeNull();
    expect(parseZloty('-5')).toBeNull();
    expect(parseZloty(String(MAX_PRICE_GROSZ / 100 + 1))).toBeNull();
    expect(parseZloty('60', 50_00)).toBeNull();
  });
});
