import { expect, test } from 'vitest';
import { SITE_URL } from '../src/lib/seo';
import { sitemapXml } from '../src/lib/sitemap';

const article = {
  slug: 'second-hall-open',
  publishedAt: '2026-10-09T16:40:12.109Z',
  hasArticle: true
};
const card = {
  slug: 'sport-card-discount',
  publishedAt: '2026-10-10T09:00:00.000Z',
  hasArticle: false
};
const cup = { slug: 'autumn-cup' };

/** The <url> entry of one address, or undefined when the sitemap does not list it. */
function entry(xml: string, path: string): string | undefined {
  return xml.split('</url>').find(block => block.includes(`<loc>${SITE_URL}${path}</loc>`));
}

test('an article is listed in each language with the day it was published', () => {
  const xml = sitemapXml([article], []);
  for (const path of [
    '/news/second-hall-open',
    '/uk/news/second-hall-open',
    '/en/news/second-hall-open'
  ]) {
    expect(entry(xml, path)).toContain('<lastmod>2026-10-09T16:40:12.109Z</lastmod>');
  }
});

test('a page whose last change is not known claims none', () => {
  const xml = sitemapXml([article], [cup]);
  expect(entry(xml, '/')).not.toContain('<lastmod>');
  expect(entry(xml, '/uk/prices')).not.toContain('<lastmod>');
  expect(entry(xml, '/tournaments/autumn-cup')).not.toContain('<lastmod>');
});

test('a news card without an article has no page to list', () => {
  const xml = sitemapXml([article, card], []);
  expect(entry(xml, '/news/sport-card-discount')).toBeUndefined();
  expect(entry(xml, '/news/second-hall-open')).toBeDefined();
});

test('every entry names the same page in the other languages', () => {
  const block = entry(sitemapXml([], [cup]), '/en/tournaments/autumn-cup');
  expect(block).toContain(`hreflang="uk" href="${SITE_URL}/uk/tournaments/autumn-cup"`);
  expect(block).toContain(`hreflang="pl" href="${SITE_URL}/tournaments/autumn-cup"`);
  expect(block).toContain(`hreflang="x-default" href="${SITE_URL}/tournaments/autumn-cup"`);
});

test('no priority hints: search engines ignore them', () => {
  expect(sitemapXml([article], [cup])).not.toContain('<priority>');
});

test('a slug cannot break out of the XML', () => {
  const xml = sitemapXml([], [{ slug: 'a&b<c' }]);
  expect(xml).not.toMatch(/a&b|<c/);
});
