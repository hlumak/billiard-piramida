import { createFileRoute } from '@tanstack/react-router';
import { DEFAULT_LOCALE } from '@repo/shared';
import { api } from '../lib/api';
import { sitemapXml } from '../lib/sitemap';

/**
 * Generated per request from VITE_SITE_URL and the live content, so it names
 * the real domain and every article and tournament page — the static file it
 * replaces hardcoded a test domain and listed neither.
 */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        // Slugs are locale-independent; a failed lookup still yields the static pages
        const [news, tournaments] = await Promise.all([
          api.news(DEFAULT_LOCALE).catch(() => []),
          api.tournaments(DEFAULT_LOCALE).catch(() => [])
        ]);
        return new Response(sitemapXml(news, tournaments), {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': 'public, max-age=3600'
          }
        });
      }
    }
  }
});
