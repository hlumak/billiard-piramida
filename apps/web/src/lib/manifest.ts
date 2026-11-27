import type { Locale } from '@repo/shared';
import { m } from '../paraglide/messages.js';
import { localizeHref } from '../paraglide/runtime.js';

/**
 * The web app manifest in one language: the name an installed app shows
 * matches the site it was installed from.
 */
export function webManifest(locale: Locale) {
  // An installed app opens in the language it was installed from
  const startUrl = localizeHref('/', { locale });
  return {
    name: m.app_name({}, { locale }),
    short_name: 'Piramida',
    description: m.app_description({}, { locale }),
    lang: locale,
    // What a browser derives from start_url when there is no id, said
    // outright: an app someone installed stays the same app even if
    // start_url later gains a parameter. Must never change.
    id: startUrl,
    start_url: startUrl,
    display: 'standalone',
    background_color: '#0a4730',
    theme_color: '#0a4730',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
