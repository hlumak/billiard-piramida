import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type NewsItemDto,
  type TournamentDto
} from '@repo/shared';
import { localizedPageUrl } from './seo';

/**
 * The public pages; private ones (/book, /booking, /bookings, /admin, /profile)
 * stay out, and so does /menu, a page of links marked noindex.
 */
const STATIC_PAGES = ['/', '/prices', '/contacts', '/tournaments', '/news'];

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, char => `&#${char.charCodeAt(0)};`);

/** A page of the site: its address without a language, and its last change when known. */
interface SitemapPage {
  path: string;
  lastmod?: string;
}

/** Every language version of a page, as Google's sitemap form of hreflang. */
function alternates(path: string): string[] {
  return [
    ...SUPPORTED_LOCALES.map(locale => [locale, localizedPageUrl(path, locale)] as const),
    ['x-default', localizedPageUrl(path, DEFAULT_LOCALE)] as const
  ].map(
    ([hreflang, href]) =>
      `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(href)}"/>`
  );
}

/**
 * The sitemap: every public page once per language, each entry listing all
 * three versions. Slugs are the same in every language.
 *
 * `lastmod` is given only where the date is real. An article has the day it
 * was published; the other pages have no record of their last change, and a
 * date that moves without the page changing teaches a search engine to ignore
 * the field. No `priority`: Google ignores it.
 */
export function sitemapXml(
  news: Pick<NewsItemDto, 'slug' | 'publishedAt' | 'hasArticle'>[],
  tournaments: Pick<TournamentDto, 'slug'>[]
): string {
  const pages: SitemapPage[] = [
    ...STATIC_PAGES.map(path => ({ path })),
    ...news
      .filter(item => item.hasArticle)
      .map(item => ({
        path: `/news/${encodeURIComponent(item.slug)}`,
        lastmod: item.publishedAt
      })),
    ...tournaments.map(item => ({ path: `/tournaments/${encodeURIComponent(item.slug)}` }))
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...pages.flatMap(page =>
      SUPPORTED_LOCALES.flatMap(locale => [
        `  <url>`,
        `    <loc>${escapeXml(localizedPageUrl(page.path, locale))}</loc>`,
        ...alternates(page.path),
        ...(page.lastmod === undefined
          ? []
          : [`    <lastmod>${escapeXml(page.lastmod)}</lastmod>`]),
        `  </url>`
      ])
    ),
    '</urlset>',
    ''
  ].join('\n');
}
