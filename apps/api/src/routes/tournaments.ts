import { Type } from '@sinclair/typebox';
import { DEFAULT_LOCALE, isLocale, type Locale, type TournamentDto } from '@repo/shared';
import { normalizePhone } from '@repo/shared/phone';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { tournamentRegistrations, tournaments, tournamentTranslations } from '../db/schema.ts';
import {
  ERROR_RESPONSE,
  TOURNAMENT_REGISTRATION_RESULT,
  TOURNAMENT_RESPONSE
} from '../lib/schemas.ts';
import { UNIQUE_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import {
  copyFor,
  seatCountsFor,
  toTournamentDto,
  toTournamentDtos,
  type SeatCounts
} from '../services/tournaments.ts';
import type { AppInstance } from '../app.ts';

const LOCALE_QUERY = Type.Object({ locale: Type.Optional(Type.String({ maxLength: 5 })) });

const SLUG_PARAMS = Type.Object({ slug: Type.String({ minLength: 1, maxLength: 80 }) });

/** Either the sign-up landed, or it did not and the reason maps to a status code. */
type RegisterOutcome =
  | { error: string; status: number; tournament?: undefined }
  | { error?: undefined; tournament: TournamentDto };

/**
 * Sign-ups are announcements of intent, not payments: the entry fee is taken at
 * the reception desk. Everything the public sees is therefore counts — never a
 * name or a phone, which live behind /api/admin/tournaments.
 */
export function tournamentRoutes(app: AppInstance) {
  const localeOf = (requested: string | undefined): Locale => {
    const value = requested ?? DEFAULT_LOCALE;
    return isLocale(value) ? value : DEFAULT_LOCALE;
  };

  /** Open sign-ups first, then announced-but-shut, then everything already over. */
  const listOrder = sql`case ${tournaments.status}
    when 'registration' then 0
    when 'closed' then 1
    else 2
  end`;

  app.get(
    '/api/tournaments',
    {
      schema: {
        querystring: LOCALE_QUERY,
        response: { 200: Type.Array(TOURNAMENT_RESPONSE) }
      }
    },
    async (request): Promise<TournamentDto[]> => {
      const locale = localeOf(request.query.locale);

      const rows = await app.db
        .select()
        .from(tournaments)
        .where(ne(tournaments.status, 'draft'))
        // Ascending dates put NULLS LAST in Postgres, which is what a tournament
        // whose date waits on a full roster should do: after the dated ones.
        .orderBy(listOrder, tournaments.startsOn, desc(tournaments.createdAt));

      if (rows.length === 0) return [];

      const ids = rows.map(row => row.id);
      const [translations, seats] = await Promise.all([
        app.db
          .select()
          .from(tournamentTranslations)
          .where(inArray(tournamentTranslations.tournamentId, ids)),
        seatCountsFor(app.db, ids)
      ]);

      return toTournamentDtos(rows, translations, seats, locale);
    }
  );

  app.get(
    '/api/tournaments/:slug',
    {
      schema: {
        params: SLUG_PARAMS,
        querystring: LOCALE_QUERY,
        response: { 200: TOURNAMENT_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const locale = localeOf(request.query.locale);

      const [row] = await app.db
        .select()
        .from(tournaments)
        .where(and(eq(tournaments.slug, request.params.slug), ne(tournaments.status, 'draft')));
      if (!row) return reply.code(404).send({ error: 'not_found' });

      const [translations, seats] = await Promise.all([
        app.db
          .select()
          .from(tournamentTranslations)
          .where(eq(tournamentTranslations.tournamentId, row.id)),
        seatCountsFor(app.db, [row.id])
      ]);

      const copy = copyFor(translations, locale);
      if (!copy) return reply.code(404).send({ error: 'not_found' });

      return toTournamentDto(row, copy, seats.get(row.id) ?? { confirmed: 0, pending: 0 });
    }
  );

  app.post(
    '/api/tournaments/:slug/register',
    {
      // A sign-up costs nothing and needs no account, so the roster is the thing
      // worth protecting: throttle well below the global 100/min. Not lower than
      // this, though — a club full of phones shares one Wi-Fi address, and a
      // mistyped number costs an attempt.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        params: SLUG_PARAMS,
        querystring: LOCALE_QUERY,
        body: Type.Object(
          {
            name: Type.String({ minLength: 1, maxLength: 80 }),
            phone: Type.String({ minLength: 3, maxLength: 25 })
          },
          { additionalProperties: false }
        ),
        response: { 201: TOURNAMENT_REGISTRATION_RESULT, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const locale = localeOf(request.query.locale);
      const name = request.body.name.trim();
      if (name === '') return reply.code(422).send({ error: 'invalid_name' });

      const phone = normalizePhone(request.body.phone);
      if (phone === null) return reply.code(422).send({ error: 'invalid_phone' });

      // Accounts stay optional — signing in only links the seat to the profile
      const user = await app.authenticatedUser(request);

      try {
        const outcome = await app.db.transaction(async (tx): Promise<RegisterOutcome> => {
          // FOR UPDATE serializes concurrent sign-ups for this one tournament, so
          // the seat count read below cannot go stale between check and insert.
          const [row] = await tx
            .select()
            .from(tournaments)
            .where(and(eq(tournaments.slug, request.params.slug), ne(tournaments.status, 'draft')))
            .for('update');
          if (!row) return { error: 'not_found', status: 404 } as const;

          const [seatRows, translations] = await Promise.all([
            tx
              .select({
                id: tournamentRegistrations.id,
                phone: tournamentRegistrations.phone,
                status: tournamentRegistrations.status
              })
              .from(tournamentRegistrations)
              .where(eq(tournamentRegistrations.tournamentId, row.id)),
            tx
              .select()
              .from(tournamentTranslations)
              .where(eq(tournamentTranslations.tournamentId, row.id))
          ]);

          const copy = copyFor(translations, locale);
          if (!copy) return { error: 'not_found', status: 404 } as const;

          const mine = seatRows.find(seat => seat.phone === phone);
          if (mine && mine.status !== 'cancelled') {
            return { error: 'already_registered', status: 409 } as const;
          }

          const seats: SeatCounts = {
            confirmed: seatRows.filter(seat => seat.status === 'confirmed').length,
            pending: seatRows.filter(seat => seat.status === 'pending').length
          };
          // Ask the DTO rather than re-deriving: whatever the storefront was
          // told about this tournament is exactly what the sign-up is checked against.
          const before = toTournamentDto(row, copy, seats);
          if (before.registrationState !== 'open') {
            const error =
              before.registrationState === 'full' ? 'tournament_full' : 'registration_closed';
            return { error, status: 409 } as const;
          }

          const seat = { name, phone, userId: user?.id ?? null, status: 'pending' as const };
          if (mine) {
            // A cancelled seat is reused rather than duplicated: the unique index
            // on (tournament, phone) means there is only ever one row per player.
            await tx
              .update(tournamentRegistrations)
              .set(seat)
              .where(eq(tournamentRegistrations.id, mine.id));
          } else {
            await tx.insert(tournamentRegistrations).values({ tournamentId: row.id, ...seat });
          }

          // Rebuilt rather than patched: the new seat can be the one that fills
          // the roster, and `registrationState` has to say so.
          return {
            tournament: toTournamentDto(row, copy, { ...seats, pending: seats.pending + 1 })
          };
        });

        if (outcome.error !== undefined) {
          return reply.code(outcome.status).send({ error: outcome.error });
        }
        return reply.code(201).send({ status: 'pending', tournament: outcome.tournament });
      } catch (err) {
        // Belt and braces behind the row lock: a duplicate can only mean the
        // same player raced themselves through two tabs.
        if (pgErrorCode(err) === UNIQUE_VIOLATION) {
          return reply.code(409).send({ error: 'already_registered' });
        }
        throw err;
      }
    }
  );
}
