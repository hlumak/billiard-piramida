import { createFileRoute } from '@tanstack/react-router';
import { SUPPORTED_LOCALES } from '@repo/shared';
import { SITE_URL } from '../lib/seo';
import { localizeHref } from '../paraglide/runtime.js';

/** App pages with nothing to index, in every language's address space. */
const PRIVATE_PATHS = ['/admin', '/book', '/booking/', '/bookings', '/profile'];
const DISALLOW = PRIVATE_PATHS.flatMap(path =>
  SUPPORTED_LOCALES.map(locale => `Disallow: ${localizeHref(path, { locale })}`)
);

/**
 * Generated from VITE_SITE_URL so it names the deployed domain. A staging
 * deploy sets ROBOTS_DISALLOW_ALL=1 (read at runtime) to stay out of search
 * results instead of competing with production as duplicate content.
 */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
          .process?.env;
        const body =
          env?.ROBOTS_DISALLOW_ALL === '1'
            ? 'User-agent: *\nDisallow: /\n'
            : [
                'User-agent: *',
                'Allow: /',
                ...DISALLOW,
                '',
                `Sitemap: ${SITE_URL}/sitemap.xml`,
                ''
              ].join('\n');
        return new Response(body, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600'
          }
        });
      }
    }
  }
});
