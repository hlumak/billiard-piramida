import type { TournamentDto } from '@repo/shared';
import { expect, test } from 'vitest';
import {
  clampDescription,
  DESCRIPTION_MAX_CHARS,
  localizedPath,
  tournamentDescription,
  tournamentJsonLd
} from '../src/lib/seo';

test('a short description is kept, with its spacing tidied', () => {
  expect(clampDescription('Cztery nowe stoły 12ft — rezerwuj online już dziś.')).toBe(
    'Cztery nowe stoły 12ft — rezerwuj online już dziś.'
  );
  expect(clampDescription('  Two brackets,\n\nbest of   three  ')).toBe(
    'Two brackets, best of three'
  );
});

test('a long description is cut at a whole word and fits a phone result', () => {
  const long =
    'Two brackets, lower and upper, races to three; the final is a race to five, and the entry fee covers table time for every match you play on the night.';
  const clamped = clampDescription(long);
  expect(clamped.length).toBeLessThanOrEqual(DESCRIPTION_MAX_CHARS);
  expect(clamped.endsWith('…')).toBe(true);
  expect(long.startsWith(clamped.slice(0, -1))).toBe(true);
  // The cut lands between words, never inside one
  expect(long[clamped.length - 1]).toMatch(/[\s,;]/);
});

test('trailing punctuation before the ellipsis goes', () => {
  const clamped = clampDescription(`${'word '.repeat(22)}end, of the line goes on`);
  expect(clamped).not.toMatch(/[,\s]…$/);
});

test('one endless word is still cut to length', () => {
  const clamped = clampDescription('x'.repeat(300));
  expect(clamped).toHaveLength(DESCRIPTION_MAX_CHARS);
});

test('a page in each language: the home keeps its slash, index routes lose theirs', () => {
  expect(localizedPath('/', 'pl')).toBe('/');
  expect(localizedPath('/', 'uk')).toBe('/uk/');
  expect(localizedPath('/tournaments/', 'en')).toBe('/en/tournaments');
  expect(localizedPath('/prices', 'pl')).toBe('/prices');
  expect(localizedPath('/news/second-hall-open', 'uk')).toBe('/uk/news/second-hall-open');
});

const tournament = (over: Partial<TournamentDto> = {}): TournamentDto => ({
  id: 2,
  slug: 'free-piramid-turnament',
  title: 'Turniej wolna piramida',
  summary: 'Turniej wolna piramida',
  details: null,
  imageUrl: null,
  status: 'registration',
  startsOn: '2026-11-15',
  startHour: 12,
  registrationDeadline: '2026-11-15',
  entryFeeGrosz: 20000,
  minPlayers: 16,
  maxPlayers: 16,
  confirmedCount: 8,
  pendingCount: 4,
  registrationState: 'open',
  ...over
});

test('a summary that only repeats the title gives way to the date and place', () => {
  const description = tournamentDescription(tournament());
  expect(description).toContain('Turniej wolna piramida');
  expect(description).toContain('15');
  expect(description).toContain('12:00');
  expect(description).not.toBe('Turniej wolna piramida');
  expect(tournamentDescription(tournament({ summary: 'Dwie drabinki, do 3 wygranych' }))).toBe(
    'Dwie drabinki, do 3 wygranych'
  );
  expect(tournamentDescription(tournament({ summary: null, startsOn: null }))).toContain(
    'Turniej wolna piramida'
  );
});

test('a dated tournament is an Event with Warsaw time, place and entry fee', () => {
  const url = 'https://billiard-piramida.pl/tournaments/free-piramid-turnament';
  const event = JSON.parse(tournamentJsonLd(tournament(), url) ?? 'null');
  expect(event['@type']).toBe('Event');
  // November is winter time in Warsaw; July is summer time
  expect(event.startDate).toBe('2026-11-15T12:00:00+01:00');
  expect(event.eventStatus).toBe('https://schema.org/EventScheduled');
  expect(event.location.address.addressLocality).toBe('Łódź');
  expect(event.offers).toMatchObject({ price: '200.00', priceCurrency: 'PLN', url });
  expect(event.offers.availability).toBe('https://schema.org/InStock');
  expect(event.offers.validThrough).toBe('2026-11-15T23:59:59+01:00');
  const summer = JSON.parse(
    tournamentJsonLd(tournament({ startsOn: '2026-07-04', startHour: 18 }), url) ?? 'null'
  );
  expect(summer.startDate).toBe('2026-07-04T18:00:00+02:00');
});

test('an undated tournament has no Event; a cancelled one says so', () => {
  expect(tournamentJsonLd(tournament({ startsOn: null }), 'x')).toBeNull();
  const cancelled = JSON.parse(
    tournamentJsonLd(tournament({ status: 'cancelled', registrationState: 'cancelled' }), 'x') ??
      'null'
  );
  expect(cancelled.eventStatus).toBe('https://schema.org/EventCancelled');
  expect(cancelled.offers.availability).toBeUndefined();
});
