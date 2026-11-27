import { afterEach, expect, test } from 'vitest';
import {
  chosenHome,
  expiredLegacyCookie,
  LOCALE_CHOICE_COOKIE,
  rememberLocaleChoice
} from '../src/lib/locale-choice';
import { getLocale } from '../src/paraglide/runtime.js';

const home = (path = '/') => new URL(`https://billiard-piramida.pl${path}`);

function clearCookies() {
  for (const entry of document.cookie.split('; ')) {
    const name = entry.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}
afterEach(clearCookies);

test('reading a page in some language stores nothing in the browser', () => {
  // The language runtime used to write its cookie the first time it was asked
  // for the language, so a shared /uk/… link counted as choosing Ukrainian
  expect(getLocale()).toBe('pl');
  expect(document.cookie).toBe('');
});

test('picking a language in the switcher is remembered', () => {
  rememberLocaleChoice('uk');
  expect(document.cookie).toContain(`${LOCALE_CHOICE_COOKIE}=uk`);
  rememberLocaleChoice('pl');
  expect(document.cookie).toContain(`${LOCALE_CHOICE_COOKIE}=pl`);
  expect(document.cookie).not.toContain(`${LOCALE_CHOICE_COOKIE}=uk`);
});

test('the bare domain opens in the language chosen earlier', () => {
  expect(chosenHome(home(), `${LOCALE_CHOICE_COOKIE}=uk`)).toBe('/uk/');
  expect(chosenHome(home('/?from=ad'), `a=1; ${LOCALE_CHOICE_COOKIE}=en; b=2`)).toBe(
    '/en/?from=ad'
  );
});

test('Polish, no choice or a made-up value leave the bare domain alone', () => {
  expect(chosenHome(home(), `${LOCALE_CHOICE_COOKIE}=pl`)).toBeNull();
  expect(chosenHome(home(), null)).toBeNull();
  expect(chosenHome(home(), `${LOCALE_CHOICE_COOKIE}=de`)).toBeNull();
  expect(chosenHome(home(), `x${LOCALE_CHOICE_COOKIE}=uk`)).toBeNull();
});

test('only the bare domain follows the choice: an address says its own language', () => {
  expect(chosenHome(home('/prices'), `${LOCALE_CHOICE_COOKIE}=uk`)).toBeNull();
  expect(chosenHome(home('/en/'), `${LOCALE_CHOICE_COOKIE}=uk`)).toBeNull();
});

test('the old cookie, written on any visit, is no choice and is taken back', () => {
  expect(chosenHome(home(), 'PARAGLIDE_LOCALE=uk')).toBeNull();
  expect(expiredLegacyCookie('a=1; PARAGLIDE_LOCALE=uk')).toMatch(
    /^PARAGLIDE_LOCALE=; Path=\/; Max-Age=0/
  );
  expect(expiredLegacyCookie(`${LOCALE_CHOICE_COOKIE}=uk`)).toBeNull();
  expect(expiredLegacyCookie(null)).toBeNull();
});
