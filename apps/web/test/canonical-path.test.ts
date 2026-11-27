import { expect, test } from 'vitest';
import { canonicalPath } from '../src/lib/canonical-path';

const at = (path: string) => canonicalPath(new URL(`https://billiard-piramida.pl${path}`));

test('a trailing slash goes, the query stays', () => {
  expect(at('/prices/')).toBe('/prices');
  expect(at('/en/prices/')).toBe('/en/prices');
  expect(at('/news/second-hall-open//')).toBe('/news/second-hall-open');
  expect(at('/prices/?from=menu')).toBe('/prices?from=menu');
});

test("a language's home keeps its slash", () => {
  expect(at('/uk')).toBe('/uk/');
  expect(at('/en?x=1')).toBe('/en/?x=1');
  expect(at('/uk/')).toBeNull();
});

test('canonical addresses are left alone', () => {
  expect(at('/')).toBeNull();
  expect(at('/prices')).toBeNull();
  expect(at('/uk/tournaments')).toBeNull();
  expect(at('//')).toBe('/');
});

test('never sends anyone to another host', () => {
  expect(at('//evil.example/')).toBe('/evil.example');
  expect(at('///evil.example//')).toBe('/evil.example');
});

test('the Polish prefix goes in the same single step: Polish pages have none', () => {
  expect(at('/pl')).toBe('/');
  expect(at('/pl/')).toBe('/');
  expect(at('/pl/prices')).toBe('/prices');
  expect(at('/pl/prices/?from=menu')).toBe('/prices?from=menu');
  expect(at('/pl/uk')).toBe('/uk/');
});

test('a page that merely starts with the letters of a language is not prefixed', () => {
  expect(at('/places')).toBeNull();
  expect(at('/plan/')).toBe('/plan');
});

test('dropping the prefix cannot leave an address on another host', () => {
  expect(at('/pl//evil.example')).toBe('/evil.example');
  expect(at('/pl//evil.example/')).toBe('/evil.example');
});
