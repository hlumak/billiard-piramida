import type { TournamentDto } from '@repo/shared';
import { expect, test } from 'vitest';
import { llmsLinkHeader, llmsTxt, llmsTxtPath } from '../src/lib/llms';
import { SITE_URL } from '../src/lib/seo';
import { FALLBACK_VENUE_CONFIG } from '../src/lib/venue-config';

const article = {
  slug: 'second-hall-open',
  title: 'Druga sala otwarta',
  body: 'Cztery nowe stoły 12ft.',
  hasArticle: true
};
const card = { slug: 'sport-card', title: 'Zniżka', body: null, hasArticle: false };
const cup: TournamentDto = {
  id: 2,
  slug: 'autumn-cup',
  title: 'Autumn Cup',
  summary: 'Dwie drabinki, do 3 wygranych',
  details: null,
  imageUrl: null,
  status: 'registration',
  startsOn: '2026-12-15',
  startHour: 12,
  registrationDeadline: '2026-12-14',
  entryFeeGrosz: 20000,
  minPlayers: 16,
  maxPlayers: 16,
  confirmedCount: 8,
  pendingCount: 4,
  registrationState: 'open'
};

const file = () =>
  llmsTxt({ news: [article, card], tournaments: [cup], config: FALLBACK_VENUE_CONFIG });

test('opens with the name and a plain summary, as the format asks', () => {
  const lines = file().split('\n');
  expect(lines[0]).toBe('# Piramida — klub bilardowy');
  expect(lines[2]).toMatch(/^> .*Łodzi/);
});

test('says where the club is, how to call it and when it is open', () => {
  const text = file();
  expect(text).toContain('ul. Tatrzańska 42/44, 1 piętro, 93-219 Łódź');
  expect(text).toContain('+48 602 56 56 55');
  // From the live config, the same hours the contacts page shows
  const { open, close } = FALLBACK_VENUE_CONFIG.hours[1]!;
  expect(text).toContain(
    `${String(open).padStart(2, '0')}:00–${String(close).padStart(2, '0')}:00`
  );
  expect(text).toMatch(/poniedziałek/);
});

test('links the public pages by their canonical addresses', () => {
  const text = file();
  for (const path of ['/prices', '/contacts', '/tournaments', '/news']) {
    // Each link carries a line about the page after it
    expect(text).toContain(`](${SITE_URL}${path}): `);
  }
});

test('lists tournaments and articles, each with a line about it', () => {
  const text = file();
  expect(text).toContain(
    `- [Autumn Cup](${SITE_URL}/tournaments/autumn-cup): Dwie drabinki, do 3 wygranych`
  );
  expect(text).toContain(
    `- [Druga sala otwarta](${SITE_URL}/news/second-hall-open): Cztery nowe stoły 12ft.`
  );
  // A news card without an article has no page of its own
  expect(text).not.toContain('sport-card');
});

test('a cancelled tournament is not offered', () => {
  const text = llmsTxt({
    news: [],
    tournaments: [{ ...cup, status: 'cancelled' }],
    config: FALLBACK_VENUE_CONFIG
  });
  expect(text).not.toContain('autumn-cup');
});

test('never points at the private app pages robots.txt closes', () => {
  expect(file()).not.toMatch(/\/(book|bookings|booking|admin|profile)\b/);
});

test('points at the same file in the other languages', () => {
  const text = file();
  expect(text).toContain(`(${SITE_URL}/uk/llms.txt)`);
  expect(text).toContain(`(${SITE_URL}/en/llms.txt)`);
});

test('staff text cannot break the list it sits in', () => {
  const text = llmsTxt({
    news: [{ ...article, title: 'Nowe [stoły]\n## Promocja', body: 'Linia 1\nLinia 2' }],
    tournaments: [],
    config: FALLBACK_VENUE_CONFIG
  });
  expect(text).toContain(
    `- [Nowe (stoły) ## Promocja](${SITE_URL}/news/second-hall-open): Linia 1 Linia 2`
  );
});

test('each language of the site is described by its own file', () => {
  expect(llmsTxtPath('/')).toBe('/llms.txt');
  expect(llmsTxtPath('/prices')).toBe('/llms.txt');
  expect(llmsTxtPath('/uk/')).toBe('/uk/llms.txt');
  expect(llmsTxtPath('/en/news/second-hall-open')).toBe('/en/llms.txt');
  expect(llmsTxtPath('/ukulele')).toBe('/llms.txt');
});

test('a page announces its file in a Link header, for agents that never read the HTML', () => {
  expect(llmsLinkHeader('/prices')).toBe('</llms.txt>; rel="describedby"; type="text/markdown"');
  expect(llmsLinkHeader('/uk/')).toBe('</uk/llms.txt>; rel="describedby"; type="text/markdown"');
});
