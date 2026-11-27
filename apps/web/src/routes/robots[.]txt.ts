import { createFileRoute } from '@tanstack/react-router';
import { robotsTxt } from '../lib/robots';

/**
 * A staging deploy sets ROBOTS_DISALLOW_ALL=1 (read at runtime) to stay out
 * of search results.
 */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
          .process?.env;
        return new Response(robotsTxt({ disallowAll: env?.ROBOTS_DISALLOW_ALL === '1' }), {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600'
          }
        });
      }
    }
  }
});
