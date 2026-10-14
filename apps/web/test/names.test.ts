import { expect, test } from 'vitest';
import { isFullName } from '../src/lib/names';

test('a first and a last name pass, in any script', () => {
  expect(isFullName('Олег Коваленко')).toBe(true);
  expect(isFullName('Jan Kowalski')).toBe(true);
  expect(isFullName('  Łucja   Żółć  ')).toBe(true);
  expect(isFullName("Мар'яна Шевчук-Бондар")).toBe(true);
  expect(isFullName('Anna Maria de Souza')).toBe(true);
});

test('one word, initials or stray symbols do not', () => {
  expect(isFullName('Олег')).toBe(false);
  expect(isFullName('')).toBe(false);
  expect(isFullName('Олег К.')).toBe(false);
  expect(isFullName('O K')).toBe(false);
  expect(isFullName('Jan 123')).toBe(false);
});
