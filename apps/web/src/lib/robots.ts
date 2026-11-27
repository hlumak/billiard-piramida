import { SUPPORTED_LOCALES } from '@repo/shared';
import { localizeHref } from '../paraglide/runtime.js';
import { SITE_URL } from './seo';

/** App pages with nothing to index, in every language's address space. */
const PRIVATE_PATHS = ['/admin', '/book', '/booking/', '/bookings', '/profile'];
const DISALLOW = PRIVATE_PATHS.flatMap(path =>
  SUPPORTED_LOCALES.map(locale => `Disallow: ${localizeHref(path, { locale })}`)
);

/**
 * The AI vendors' crawlers, by the names they publish: training (GPTBot,
 * ClaudeBot, Google-Extended, Applebot-Extended, CCBot), search indexes
 * (OAI-SearchBot, Claude-SearchBot, PerplexityBot) and fetches made for one
 * person's question (ChatGPT-User, Claude-User, Perplexity-User).
 *
 * All are welcome. The public pages are what the club wants people to find:
 * where it is, when it is open, what a table costs, the next tournament. An
 * assistant that has read them answers "where can I play billiards in Łódź"
 * with the club's own facts. Nothing here is paid or private content, so
 * there is nothing to keep out of training either. Naming them says so on
 * purpose, where a bare "*" leaves it to each vendor's reading.
 *
 * Names change; the vendors' own pages are the source (checked 2026-11).
 */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'Google-Extended',
  'Applebot-Extended',
  'PerplexityBot',
  'Perplexity-User',
  'CCBot'
] as const;

/**
 * robots.txt, naming the deployed domain. One group for everyone: a crawler
 * that finds its own name follows only that group and ignores "*", so the
 * named crawlers share the group that closes the private pages rather than
 * getting one of their own without those lines.
 *
 * `disallowAll` is a staging deploy, which stays out of search results
 * instead of competing with production as duplicate content.
 */
export function robotsTxt({ disallowAll = false } = {}): string {
  if (disallowAll) return 'User-agent: *\nDisallow: /\n';
  return [
    ...AI_CRAWLERS.map(agent => `User-agent: ${agent}`),
    'User-agent: *',
    'Allow: /',
    ...DISALLOW,
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    ''
  ].join('\n');
}
