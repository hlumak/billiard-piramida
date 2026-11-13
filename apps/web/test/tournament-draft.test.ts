import { expect, test } from 'vitest';
import type { AdminTournamentDto } from '@repo/shared';
import {
  checkTournamentDraft,
  draftClosureRange,
  tournamentDraftFrom,
  tournamentErrorText,
  type TournamentDraft
} from '../src/components/admin/tournament-draft';
import { m } from '../src/paraglide/messages.js';

/** A complete, valid draft; each test breaks one thing. */
function draft(overrides: Partial<TournamentDraft> = {}): TournamentDraft {
  return {
    ...tournamentDraftFrom(null),
    startsOn: '2026-11-14',
    startHour: '18',
    registrationDeadline: '2026-11-12',
    entryFee: '40',
    minPlayers: '8',
    maxPlayers: '16',
    titles: { uk: 'Турнір', pl: 'Turniej', en: 'Tournament' },
    ...overrides
  };
}

test('a complete draft becomes the API input, in grosze and trimmed', () => {
  const check = checkTournamentDraft(
    draft({
      entryFee: '40,50',
      imageUrl: '  ',
      titles: { uk: ' Турнір ', pl: 'Turniej', en: 'Cup' }
    })
  );
  expect(check).toEqual({
    ok: true,
    input: {
      status: 'draft',
      startsOn: '2026-11-14',
      startHour: 18,
      endHour: null,
      tableIds: [],
      registrationDeadline: '2026-11-12',
      entryFeeGrosz: 4050,
      minPlayers: 8,
      maxPlayers: 16,
      imageUrl: null,
      translations: [
        { locale: 'uk', title: 'Турнір', summary: null, details: null },
        { locale: 'pl', title: 'Turniej', summary: null, details: null },
        { locale: 'en', title: 'Cup', summary: null, details: null }
      ]
    }
  });
});

test('blank optional fields clear their column instead of failing', () => {
  const check = checkTournamentDraft(
    draft({ startsOn: '', startHour: '', registrationDeadline: '', entryFee: '', maxPlayers: '' })
  );
  expect(check.ok && check.input).toMatchObject({
    startsOn: null,
    startHour: null,
    registrationDeadline: null,
    entryFeeGrosz: null,
    maxPlayers: null
  });
});

test.each([
  ['an unsafe picture URL', { imageUrl: 'javascript:alert(1)' }, 'invalid_url'],
  ['a deadline after the start', { registrationDeadline: '2026-11-15' }, 'deadline_after_start'],
  ['a minimum above the maximum', { minPlayers: '20' }, 'min_above_max'],
  ['a fee that is not an amount', { entryFee: 'free' }, 'invalid_fee'],
  ['an impossible date', { startsOn: '2026-02-31' }, 'incomplete'],
  ['an hour outside the day', { startHour: '24' }, 'incomplete'],
  ['a one-player bracket', { maxPlayers: '1' }, 'incomplete'],
  ['a missing language', { titles: { uk: 'Турнір', pl: '', en: 'Cup' } }, 'incomplete']
] as const)('%s is refused (%s)', (_label, overrides, problem) => {
  expect(checkTournamentDraft(draft(overrides))).toEqual({ ok: false, problem });
});

test('the problem with its own message wins over an incomplete field', () => {
  // The URL message is the one staff can act on; the bad date keeps Save off either way
  const check = checkTournamentDraft(draft({ imageUrl: 'ftp://x', startsOn: 'soon' }));
  expect(check).toEqual({ ok: false, problem: 'invalid_url' });
});

test('an existing tournament round-trips through the draft unchanged', () => {
  const item: AdminTournamentDto = {
    id: 7,
    slug: 'cup',
    title: 'Turniej',
    summary: null,
    details: 'Zasady',
    status: 'registration',
    startsOn: '2026-11-14',
    startHour: 18,
    // 01:00 the morning after, on the club day's scale
    endHour: 25,
    tableIds: [10, 11],
    registrationDeadline: '2026-11-12',
    entryFeeGrosz: 4000,
    minPlayers: 8,
    maxPlayers: 16,
    imageUrl: '/uploads/cup.webp',
    confirmedCount: 0,
    pendingCount: 0,
    registrationState: 'open',
    translations: [
      { locale: 'uk', title: 'Турнір', summary: 'Коротко', details: null },
      { locale: 'pl', title: 'Turniej', summary: null, details: 'Zasady' },
      { locale: 'en', title: 'Cup', summary: null, details: null }
    ]
  };
  const opened = tournamentDraftFrom(item);
  // The end opens as the hour it was typed as
  expect([opened.endHour, opened.tableIds]).toEqual(['1', [10, 11]]);
  const check = checkTournamentDraft(opened);
  expect(check.ok && check.input).toMatchObject({
    status: 'registration',
    endHour: 25,
    tableIds: [10, 11],
    entryFeeGrosz: 4000,
    imageUrl: '/uploads/cup.webp',
    translations: item.translations
  });
});

test('the editor says the most specific problem, and echoes the server', () => {
  expect(tournamentErrorText('invalid_url', null, false)).toBe(m.admin_invalid_url());
  // The server refusing the same thing reads the same as the form catching it
  expect(tournamentErrorText(null, 'min_above_max', true)).toBe(m.admin_tournament_min_above_max());
  // A problem the form has wins over a different refusal from an older save
  expect(tournamentErrorText('deadline_after_start', 'invalid_url', true)).toBe(
    m.admin_invalid_url()
  );
  // Only the form parses the fee: a server code of that name means nothing here
  expect(tournamentErrorText(null, 'invalid_fee', false)).toBeNull();
  // Incomplete fields say nothing (Save stays disabled); a failed save does
  expect(tournamentErrorText('incomplete', null, false)).toBeNull();
  expect(tournamentErrorText('incomplete', 'internal_error', true)).toBe(m.err_generic());
});

const inputOf = (overrides: Partial<TournamentDraft>) => {
  const check = checkTournamentDraft(draft(overrides));
  if (!check.ok) throw new Error(check.problem);
  return check.input;
};

test('the end is typed as a clock hour; at or before the start it is the night after', () => {
  expect(inputOf({ endHour: '23' }).endHour).toBe(23);
  expect(inputOf({ endHour: '0' }).endHour).toBe(24);
  expect(inputOf({ endHour: '2' }).endHour).toBe(26);
  expect(inputOf({ endHour: '' }).endHour).toBe(null);
});

test('an end past 02:00 the morning after, or with no start, is refused with its own message', () => {
  for (const overrides of [{ endHour: '3' }, { endHour: '18' }, { startHour: '', endHour: '23' }]) {
    const check = checkTournamentDraft(draft(overrides));
    expect(check).toEqual({ ok: false, problem: 'end_before_start' });
  }
  expect(tournamentErrorText('end_before_start', null, false)).toBe(
    m.admin_tournament_end_before_start()
  );
});

test('ticked tables go to the API ascending', () => {
  expect(inputOf({ tableIds: [11, 8, 10] }).tableIds).toEqual([8, 10, 11]);
});

test('the tables close over the date, start and end, even while the copy is unfinished', () => {
  const unfinished = draft({ endHour: '1', titles: { uk: '', pl: '', en: '' } });
  expect(checkTournamentDraft(unfinished).ok).toBe(false);
  expect(draftClosureRange(unfinished)).toEqual({
    startDate: '2026-11-14',
    startHour: 18,
    endDate: '2026-11-15',
    endHour: 1
  });
  expect(draftClosureRange(draft({ endHour: '' }))).toBe(null);
  expect(draftClosureRange(draft({ startsOn: '', endHour: '23' }))).toBe(null);
});

test('a booking in the way of the tables, found on save, has its own message', () => {
  expect(tournamentErrorText(null, 'closure_conflicts', true)).toBe(m.err_closure_conflicts());
});
