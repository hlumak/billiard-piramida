import { count, inArray } from 'drizzle-orm';
import {
  isIsoDate,
  registrationStateOf,
  type AdminTournamentDto,
  type IsoDate,
  type Locale,
  type TournamentDto
} from '@repo/shared';
import { tournamentRegistrations, tournaments, tournamentTranslations } from '../db/schema.ts';
import { warsawDateOf } from '../lib/time.ts';
import type { Db } from '../db/client.ts';

/** Copy falls back to English when a locale is missing, same as /api/menu and /api/news. */
const FALLBACK_LOCALE: Locale = 'en';

/** Staff read tournaments in uk, same convention as the menu and news tabs. */
const STAFF_LOCALE: Locale = 'uk';

export type TournamentRow = typeof tournaments.$inferSelect;
export type TournamentTranslationRow = typeof tournamentTranslations.$inferSelect;

export interface SeatCounts {
  confirmed: number;
  pending: number;
}

const NO_SEATS: SeatCounts = { confirmed: 0, pending: 0 };

/**
 * Roster sizes for a set of tournaments, in one grouped pass rather than a
 * count per row. Cancelled sign-ups are released: they hold no seat, so a
 * player who drops out frees their place for the next one.
 */
export async function seatCountsFor(db: Db, ids: number[]): Promise<Map<number, SeatCounts>> {
  const seats = new Map<number, SeatCounts>();
  if (ids.length === 0) return seats;

  const rows = await db
    .select({
      tournamentId: tournamentRegistrations.tournamentId,
      status: tournamentRegistrations.status,
      total: count()
    })
    .from(tournamentRegistrations)
    .where(inArray(tournamentRegistrations.tournamentId, ids))
    .groupBy(tournamentRegistrations.tournamentId, tournamentRegistrations.status);

  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    const entry = seats.get(row.tournamentId) ?? { confirmed: 0, pending: 0 };
    entry[row.status] += row.total;
    seats.set(row.tournamentId, entry);
  }
  return seats;
}

/** `date` columns come back as plain strings; narrow rather than cast. */
function asIsoDate(value: string | null): IsoDate | null {
  return value !== null && isIsoDate(value) ? value : null;
}

interface Copy {
  title: string;
  summary: string | null;
  details: string | null;
}

/** Best available copy for `locale`, English as the fallback; null when neither exists. */
export function copyFor(translations: TournamentTranslationRow[], locale: Locale): Copy | null {
  const best =
    translations.find(t => t.locale === locale) ??
    translations.find(t => t.locale === FALLBACK_LOCALE) ??
    translations[0];
  return best ? { title: best.title, summary: best.summary, details: best.details } : null;
}

export function toTournamentDto(row: TournamentRow, copy: Copy, seats: SeatCounts): TournamentDto {
  const registrationDeadline = asIsoDate(row.registrationDeadline);
  return {
    id: row.id,
    slug: row.slug,
    ...copy,
    imageUrl: row.imageUrl,
    status: row.status,
    startsOn: asIsoDate(row.startsOn),
    startHour: row.startHour,
    registrationDeadline,
    entryFeeGrosz: row.entryFeeGrosz,
    minPlayers: row.minPlayers,
    maxPlayers: row.maxPlayers,
    confirmedCount: seats.confirmed,
    pendingCount: seats.pending,
    registrationState: registrationStateOf(
      {
        status: row.status,
        registrationDeadline,
        maxPlayers: row.maxPlayers,
        takenSeats: seats.confirmed + seats.pending
      },
      warsawDateOf(new Date())
    )
  };
}

/**
 * Resolve rows to one locale. A tournament with no usable copy is dropped
 * rather than rendered headless — same call the news carousel makes.
 */
export function toTournamentDtos(
  rows: TournamentRow[],
  translations: TournamentTranslationRow[],
  seats: Map<number, SeatCounts>,
  locale: Locale
): TournamentDto[] {
  return rows.flatMap(row => {
    const copy = copyFor(
      translations.filter(t => t.tournamentId === row.id),
      locale
    );
    if (!copy) return [];
    return [toTournamentDto(row, copy, seats.get(row.id) ?? NO_SEATS)];
  });
}

/** Staff view: uk copy up front, every translation attached for the editor. */
export function toAdminTournamentDto(
  row: TournamentRow,
  translations: TournamentTranslationRow[],
  seats: SeatCounts = NO_SEATS
): AdminTournamentDto {
  const forRow = translations.filter(t => t.tournamentId === row.id);
  // A draft can exist before any copy does, so the staff list must survive it
  const copy = copyFor(forRow, STAFF_LOCALE) ?? { title: row.slug, summary: null, details: null };
  return {
    ...toTournamentDto(row, copy, seats),
    translations: forRow.map(t => ({
      locale: t.locale as Locale,
      title: t.title,
      summary: t.summary,
      details: t.details
    }))
  };
}
