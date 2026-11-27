import { createFileRoute } from '@tanstack/react-router';
import { baseLocale, isLocale } from '../paraglide/runtime.js';
import { webManifest } from '../lib/manifest';

/**
 * The web app manifest in the visitor's language: the root links it with
 * `?locale=` (the static file was Ukrainian for everyone).
 */
export const Route = createFileRoute('/manifest.webmanifest')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const requested = new URL(request.url).searchParams.get('locale');
        const locale = isLocale(requested) ? requested : baseLocale;
        return new Response(JSON.stringify(webManifest(locale)), {
          headers: {
            'content-type': 'application/manifest+json; charset=utf-8',
            'cache-control': 'public, max-age=3600'
          }
        });
      }
    }
  }
});
