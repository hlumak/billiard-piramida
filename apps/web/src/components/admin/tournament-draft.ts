import {
  MAX_TOURNAMENT_PLAYERS,
  SUPPORTED_LOCALES,
  isIsoDate,
  isSafeUrl,
  type AdminTournamentDto,
  type IsoDate,
  type Locale,
  type TournamentStatus,
  type TournamentTranslationDto
} from '@repo/shared';
import type { AdminTournamentInput } from '../../lib/admin-api';
import { m } from '../../paraglide/messages.js';
import { parseZloty } from '../../lib/money';

/** The tournament editor's form state: every field as typed. */
export interface TournamentDraft {
  status: TournamentStatus;
  startsOn: string;
  startHour: string;
  registrationDeadline: string;
  /** Entered in złoty; converted to grosze on submit */
  entryFee: string;
  minPlayers: string;
  maxPlayers: string;
  imageUrl: string;
  titles: Record<Locale, string>;
  summaries: Record<Locale, string>;
  details: Record<Locale, string>;
}

export function tournamentDraftFrom(item: AdminTournamentDto | null): TournamentDraft {
  const titles = { uk: '', pl: '', en: '' };
  const summaries = { uk: '', pl: '', en: '' };
  const details = { uk: '', pl: '', en: '' };
  for (const t of item?.translations ?? []) {
    titles[t.locale] = t.title;
    summaries[t.locale] = t.summary ?? '';
    details[t.locale] = t.details ?? '';
  }
  return {
    status: item?.status ?? 'draft',
    startsOn: item?.startsOn ?? '',
    startHour: item?.startHour === null || item === null ? '' : String(item.startHour),
    registrationDeadline: item?.registrationDeadline ?? '',
    entryFee: item?.entryFeeGrosz != null ? String(item.entryFeeGrosz / 100) : '',
    minPlayers: String(item?.minPlayers ?? 0),
    maxPlayers: item?.maxPlayers != null ? String(item.maxPlayers) : '',
    imageUrl: item?.imageUrl ?? '',
    titles,
    summaries,
    details
  };
}

/** "" clears the column; anything else must parse as a calendar date. */
function parseDate(value: string): IsoDate | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return isIsoDate(trimmed) ? trimmed : undefined;
}

/** "" clears; otherwise an integer within [min, max], or undefined when unusable. */
function parseCount(value: string, min: number, max: number): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

/**
 * Why a draft can't be submitted, most specific first. The first four have a
 * message of their own (and match the codes the server answers with);
 * `incomplete` is a field that doesn't parse yet or a missing language, which
 * the form shows by keeping Save disabled.
 */
export type TournamentDraftProblem =
  | 'invalid_url'
  | 'deadline_after_start'
  | 'min_above_max'
  | 'invalid_fee'
  | 'incomplete';

export type TournamentDraftCheck =
  | { ok: true; input: AdminTournamentInput }
  | { ok: false; problem: TournamentDraftProblem };

/** The draft as the API input, or the first reason it isn't one yet. The server re-checks all of it. */
export function checkTournamentDraft(draft: TournamentDraft): TournamentDraftCheck {
  const startsOn = parseDate(draft.startsOn);
  const registrationDeadline = parseDate(draft.registrationDeadline);
  const startHour = parseCount(draft.startHour, 0, 23);
  const maxPlayers = parseCount(draft.maxPlayers, 2, MAX_TOURNAMENT_PLAYERS);
  const minPlayers = parseCount(draft.minPlayers, 0, MAX_TOURNAMENT_PLAYERS) ?? undefined;
  // Blank means "not priced yet" (null); anything typed must be a valid amount
  const feeBlank = draft.entryFee.trim() === '';
  const entryFeeGrosz = feeBlank ? null : parseZloty(draft.entryFee);
  const imageUrl = draft.imageUrl.trim() || null;

  const translations: TournamentTranslationDto[] = SUPPORTED_LOCALES.flatMap(locale => {
    const title = draft.titles[locale].trim();
    if (title === '') return [];
    return [
      {
        locale,
        title,
        summary: draft.summaries[locale].trim() || null,
        details: draft.details[locale].trim() || null
      }
    ];
  });

  if (imageUrl !== null && !isSafeUrl(imageUrl)) return { ok: false, problem: 'invalid_url' };
  // `== null` on purpose: an unparseable date is undefined here, and it is
  // reported as incomplete below — this check only owns the ordering.
  if (startsOn != null && registrationDeadline != null && registrationDeadline > startsOn) {
    return { ok: false, problem: 'deadline_after_start' };
  }
  if (minPlayers !== undefined && maxPlayers != null && minPlayers > maxPlayers) {
    return { ok: false, problem: 'min_above_max' };
  }
  if (!feeBlank && entryFeeGrosz === null) return { ok: false, problem: 'invalid_fee' };
  if (
    startsOn === undefined ||
    registrationDeadline === undefined ||
    startHour === undefined ||
    maxPlayers === undefined ||
    minPlayers === undefined ||
    translations.length !== SUPPORTED_LOCALES.length
  ) {
    return { ok: false, problem: 'incomplete' };
  }
  return {
    ok: true,
    input: {
      status: draft.status,
      startsOn,
      startHour,
      registrationDeadline,
      entryFeeGrosz,
      minPlayers,
      maxPlayers,
      imageUrl,
      translations
    }
  };
}

/** The problems with a message of their own, most specific first. */
const PROBLEM_MESSAGES = [
  ['invalid_url', m.admin_invalid_url],
  ['deadline_after_start', m.admin_tournament_deadline_after_start],
  ['min_above_max', m.admin_tournament_min_above_max],
  ['invalid_fee', m.admin_invalid_price]
] as const;

/**
 * What the editor says under the fields: the draft's own problem, or the same
 * refusal from the server (it re-checks everything but the fee, which only
 * the form parses), else a generic failure once a save has failed.
 */
export function tournamentErrorText(
  problem: TournamentDraftProblem | null,
  rejectedCode: string | null,
  saveFailed: boolean
): string | null {
  for (const [code, message] of PROBLEM_MESSAGES) {
    if (problem === code || (code !== 'invalid_fee' && rejectedCode === code)) return message();
  }
  return saveFailed ? m.err_generic() : null;
}
