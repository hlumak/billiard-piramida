import { createFileRoute } from '@tanstack/react-router';
import { baseLocale, isLocale, localizeHref } from '../paraglide/runtime.js';
import { m } from '../paraglide/messages.js';

/**
 * The web app manifest in the visitor's language: the root links it with
 * `?locale=`, so the name an installed app shows matches the site it came
 * from (the static file was Ukrainian for everyone).
 */
export const Route = createFileRoute('/manifest.webmanifest')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const requested = new URL(request.url).searchParams.get('locale');
        const locale = isLocale(requested) ? requested : baseLocale;
        const manifest = {
          name: m.app_name({}, { locale }),
          short_name: 'piramida',
          description: m.app_description({}, { locale }),
          lang: locale,
          // An installed app opens in the language it was installed from
          start_url: localizeHref('/', { locale }),
          display: 'standalone',
          background_color: '#0b4e31',
          theme_color: '#0b4e31',
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
        return new Response(JSON.stringify(manifest), {
          headers: {
            'content-type': 'application/manifest+json; charset=utf-8',
            'cache-control': 'public, max-age=3600'
          }
        });
      }
    }
  }
});
