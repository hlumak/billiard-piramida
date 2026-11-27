import { expect, test } from 'vitest';
import { webManifest } from '../src/lib/manifest';

test('each language installs as its own app, named by the address it opens', () => {
  // The id a browser would derive from start_url, said outright: an installed
  // app must stay the same app if start_url ever gains a parameter
  expect(webManifest('pl')).toMatchObject({ id: '/', start_url: '/', lang: 'pl' });
  expect(webManifest('uk')).toMatchObject({ id: '/uk/', start_url: '/uk/', lang: 'uk' });
  expect(webManifest('en')).toMatchObject({ id: '/en/', start_url: '/en/', lang: 'en' });
});

test('the app is named in the language it was installed from', () => {
  expect(webManifest('pl').name).not.toBe(webManifest('en').name);
  expect(webManifest('en').short_name).toBe('Piramida');
});

test('icons cover the launcher sizes and the maskable shape', () => {
  const icons = webManifest('pl').icons;
  expect(icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(icons.some(icon => 'purpose' in icon && icon.purpose === 'maskable')).toBe(true);
});
