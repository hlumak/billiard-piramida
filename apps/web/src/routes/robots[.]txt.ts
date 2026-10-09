import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '../lib/seo';

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
                'Disallow: /admin',
                'Disallow: /book',
                'Disallow: /booking/',
                'Disallow: /bookings',
                'Disallow: /profile',
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
