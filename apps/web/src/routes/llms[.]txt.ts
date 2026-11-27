import { createFileRoute } from '@tanstack/react-router';
import { api } from '../lib/api';
import { llmsTxt } from '../lib/llms';
import { FALLBACK_VENUE_CONFIG } from '../lib/venue-config';
import { getLocale } from '../paraglide/runtime.js';

/**
 * The site's index for AI assistants (see lib/llms.ts), in the language of
 * the address it is asked at: /llms.txt is Polish, /uk/llms.txt Ukrainian.
 */
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => {
        const locale = getLocale();
        // A failed lookup leaves that list out; the file is still worth serving
        const [news, tournaments, config] = await Promise.all([
          api.news(locale).catch(() => []),
          api.tournaments(locale).catch(() => []),
          api.venueConfig().catch(() => FALLBACK_VENUE_CONFIG)
        ]);
        return new Response(llmsTxt({ news, tournaments, config }), {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'cache-control': 'public, max-age=3600',
            // For assistants to read, not a page for search results
            'x-robots-tag': 'noindex'
          }
        });
      }
    }
  }
});
