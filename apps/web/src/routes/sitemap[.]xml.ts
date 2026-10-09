import { createFileRoute } from '@tanstack/react-router';
// Type-only: brings in Start's route augmentation (`server.handlers`) without
// adding anything to the bundle
import type {} from '@tanstack/react-start';
import { DEFAULT_LOCALE } from '@repo/shared';
import { api } from '../lib/api';
import { SITE_URL } from '../lib/seo';

/** The public pages; private ones (/book, /booking, /bookings, /admin, /profile) stay out. */
const STATIC_PAGES: { path: string; priority: string }[] = [
  { path: '/', priority: '1.0' },
  { path: '/prices', priority: '0.8' },
  { path: '/contacts', priority: '0.8' },
  { path: '/tournaments', priority: '0.8' },
  { path: '/news', priority: '0.7' },
  { path: '/menu', priority: '0.6' }
];

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, char => `&#${char.charCodeAt(0)};`);

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
        const urls = [
          ...STATIC_PAGES.map(page => ({ loc: page.path, priority: page.priority })),
          ...news
            .filter(item => item.hasArticle)
            .map(item => ({ loc: `/news/${encodeURIComponent(item.slug)}`, priority: '0.5' })),
          ...tournaments.map(item => ({
            loc: `/tournaments/${encodeURIComponent(item.slug)}`,
            priority: '0.6'
          }))
        ];
        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls.map(
            url =>
              `  <url><loc>${escapeXml(`${SITE_URL}${url.loc}`)}</loc><priority>${url.priority}</priority></url>`
          ),
          '</urlset>',
          ''
        ].join('\n');
        return new Response(body, {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': 'public, max-age=3600'
          }
        });
      }
    }
  }
});
