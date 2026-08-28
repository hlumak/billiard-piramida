import assert from 'node:assert';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { MAX_TOURNAMENT_PLAYERS, isSafeUrl } from '@repo/shared';
import { normalizePhone } from '@repo/shared/phone';
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { tournamentRegistrations, tournaments, tournamentTranslations } from '../db/schema.ts';
import {
  ADMIN_TOURNAMENT_REGISTRATION_RESPONSE,
  ADMIN_TOURNAMENT_RESPONSE,
  ERROR_RESPONSE,
  LOCALE_SCHEMA,
  TOURNAMENT_REGISTRATION_STATUS,
  TOURNAMENT_STATUS
} from '../lib/schemas.ts';
import { UNIQUE_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import { slugify } from '../lib/slug.ts';
import { seatCountsFor, toAdminTournamentDto } from '../services/tournaments.ts';

const TRANSLATIONS_BODY = Type.Array(
  Type.Object(
    {
      locale: LOCALE_SCHEMA,
      title: Type.String({ minLength: 1, maxLength: 120 }),
      summary: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
      details: Type.Optional(Type.Union([Type.String({ maxLength: 4000 }), Type.Null()]))
    },
    { additionalProperties: false }
  ),
  { minItems: 1, maxItems: 3 }
);

/** Every nullable scalar takes the same shape: absent = leave alone, null = clear. */
const OPTIONAL_DATE = Type.Optional(
  Type.Union([Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }), Type.Null()])
);
const OPTIONAL_HOUR = Type.Optional(
  Type.Union([Type.Integer({ minimum: 0, maximum: 23 }), Type.Null()])
);
const OPTIONAL_FEE = Type.Optional(
  Type.Union([Type.Integer({ minimum: 0, maximum: 1_000_00 }), Type.Null()])
);
const OPTIONAL_MAX_PLAYERS = Type.Optional(
  Type.Union([Type.Integer({ minimum: 2, maximum: MAX_TOURNAMENT_PLAYERS }), Type.Null()])
);
const OPTIONAL_MIN_PLAYERS = Type.Optional(
  Type.Integer({ minimum: 0, maximum: MAX_TOURNAMENT_PLAYERS })
);
const OPTIONAL_URL = Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()]));

const ID_PARAMS = Type.Object({ id: Type.Integer({ minimum: 1 }) });
// Strict UUID shape, as in bookings: a loose pattern lets malformed ids reach
// Postgres as a uuid cast and surface as a logged 500 instead of a clean 404.
const REGISTRATION_PARAMS = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  registrationId: Type.String({
    pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  })
});

/** Blank input clears the column; anything left is trimmed. */
function cleanText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Staff-side tournaments: the announcement itself and the roster behind it.
 * Registered inside the admin plugin's guarded scope, so it inherits the
 * token check rather than repeating it.
 */
export const adminTournamentRoutes: FastifyPluginAsyncTypebox = async admin => {
  /** The DTO carries live seat counts, so every write re-reads them. */
  const loadAdminDto = async (id: number) => {
    const [row] = await admin.db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!row) return null;
    const [translations, seats] = await Promise.all([
      admin.db
        .select()
        .from(tournamentTranslations)
        .where(eq(tournamentTranslations.tournamentId, id)),
      seatCountsFor(admin.db, [id])
    ]);
    return toAdminTournamentDto(row, translations, seats.get(id) ?? { confirmed: 0, pending: 0 });
  };

  admin.get(
    '/api/admin/tournaments',
    { schema: { response: { 200: Type.Array(ADMIN_TOURNAMENT_RESPONSE) } } },
    async () => {
      const rows = await admin.db.select().from(tournaments).orderBy(desc(tournaments.createdAt));
      if (rows.length === 0) return [];

      const ids = rows.map(row => row.id);
      const [translations, seats] = await Promise.all([
        admin.db
          .select()
          .from(tournamentTranslations)
          .where(inArray(tournamentTranslations.tournamentId, ids)),
        seatCountsFor(admin.db, ids)
      ]);

      return rows.map(row =>
        toAdminTournamentDto(row, translations, seats.get(row.id) ?? { confirmed: 0, pending: 0 })
      );
    }
  );

  admin.post(
    '/api/admin/tournaments',
    {
      schema: {
        body: Type.Object(
          {
            /** Omitted: derived from the English (or first) title */
            slug: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
            status: Type.Optional(TOURNAMENT_STATUS),
            startsOn: OPTIONAL_DATE,
            startHour: OPTIONAL_HOUR,
            registrationDeadline: OPTIONAL_DATE,
            entryFeeGrosz: OPTIONAL_FEE,
            minPlayers: OPTIONAL_MIN_PLAYERS,
            maxPlayers: OPTIONAL_MAX_PLAYERS,
            imageUrl: OPTIONAL_URL,
            translations: TRANSLATIONS_BODY
          },
          { additionalProperties: false }
        ),
        response: { 201: ADMIN_TOURNAMENT_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { status, startsOn, startHour, registrationDeadline, translations } = request.body;
      const { entryFeeGrosz, minPlayers, maxPlayers } = request.body;

      const imageUrl = cleanText(request.body.imageUrl) ?? null;
      if (imageUrl !== null && !isSafeUrl(imageUrl)) {
        return reply.code(422).send({ error: 'invalid_url' });
      }
      // A dated tournament that shuts sign-ups after it starts is a data entry
      // slip, not something to discover once nobody can register.
      if (startsOn != null && registrationDeadline != null && registrationDeadline > startsOn) {
        return reply.code(422).send({ error: 'deadline_after_start' });
      }

      // An all-Cyrillic title slugifies to nothing; `slugify`'s fallback owns that
      const en = translations.find(t => t.locale === 'en');
      const titleForSlug = en?.title ?? translations[0]?.title ?? '';
      const base = slugify(request.body.slug ?? titleForSlug, 'tournament');

      const created = await admin.db.transaction(async tx => {
        // Unique slug: append a counter on collision, same as menu items
        let slug = base;
        for (let attempt = 2; attempt < 20; attempt++) {
          const [existing] = await tx
            .select({ id: tournaments.id })
            .from(tournaments)
            .where(eq(tournaments.slug, slug));
          if (!existing) break;
          slug = `${base}-${attempt}`;
        }

        const [row] = await tx
          .insert(tournaments)
          .values({
            slug,
            imageUrl,
            ...(status !== undefined ? { status } : {}),
            ...(startsOn !== undefined ? { startsOn } : {}),
            ...(startHour !== undefined ? { startHour } : {}),
            ...(registrationDeadline !== undefined ? { registrationDeadline } : {}),
            ...(entryFeeGrosz !== undefined ? { entryFeeGrosz } : {}),
            ...(minPlayers !== undefined ? { minPlayers } : {}),
            ...(maxPlayers !== undefined ? { maxPlayers } : {})
          })
          .returning();
        assert(row, 'insert returned no row');

        await tx.insert(tournamentTranslations).values(
          translations.map(t => ({
            tournamentId: row.id,
            locale: t.locale,
            title: t.title.trim(),
            summary: cleanText(t.summary) ?? null,
            details: cleanText(t.details) ?? null
          }))
        );
        return row;
      });

      const dto = await loadAdminDto(created.id);
      assert(dto, 'tournament vanished after insert');
      return reply.code(201).send(dto);
    }
  );

  admin.patch(
    '/api/admin/tournaments/:id',
    {
      schema: {
        params: ID_PARAMS,
        body: Type.Object(
          {
            status: Type.Optional(TOURNAMENT_STATUS),
            startsOn: OPTIONAL_DATE,
            startHour: OPTIONAL_HOUR,
            registrationDeadline: OPTIONAL_DATE,
            entryFeeGrosz: OPTIONAL_FEE,
            minPlayers: OPTIONAL_MIN_PLAYERS,
            maxPlayers: OPTIONAL_MAX_PLAYERS,
            imageUrl: OPTIONAL_URL,
            translations: Type.Optional(TRANSLATIONS_BODY)
          },
          { additionalProperties: false }
        ),
        response: { 200: ADMIN_TOURNAMENT_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { status, startsOn, startHour, registrationDeadline, translations } = request.body;
      const { entryFeeGrosz, minPlayers, maxPlayers } = request.body;

      // undefined = leave the column alone, null = clear it
      const imageUrl = cleanText(request.body.imageUrl);
      if (typeof imageUrl === 'string' && !isSafeUrl(imageUrl)) {
        return reply.code(422).send({ error: 'invalid_url' });
      }

      const patch = {
        ...(status !== undefined ? { status } : {}),
        ...(startsOn !== undefined ? { startsOn } : {}),
        ...(startHour !== undefined ? { startHour } : {}),
        ...(registrationDeadline !== undefined ? { registrationDeadline } : {}),
        ...(entryFeeGrosz !== undefined ? { entryFeeGrosz } : {}),
        ...(minPlayers !== undefined ? { minPlayers } : {}),
        ...(maxPlayers !== undefined ? { maxPlayers } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {})
      };

      const updated = await admin.db.transaction(async tx => {
        // A translations-only PATCH touches no tournaments column; Drizzle refuses
        // an empty `set`, so read the row instead of updating it (as with news).
        const [row] =
          Object.keys(patch).length > 0
            ? await tx
                .update(tournaments)
                .set(patch)
                .where(eq(tournaments.id, request.params.id))
                .returning()
            : await tx.select().from(tournaments).where(eq(tournaments.id, request.params.id));
        if (!row) return null;

        if (translations !== undefined && translations.length > 0) {
          // One statement for all three locales: `excluded` is the row Postgres
          // was about to insert, so the update reads each locale's own copy.
          await tx
            .insert(tournamentTranslations)
            .values(
              translations.map(t => ({
                tournamentId: row.id,
                locale: t.locale,
                title: t.title.trim(),
                summary: cleanText(t.summary) ?? null,
                details: cleanText(t.details) ?? null
              }))
            )
            .onConflictDoUpdate({
              target: [tournamentTranslations.tournamentId, tournamentTranslations.locale],
              set: {
                title: sql`excluded.title`,
                summary: sql`excluded.summary`,
                details: sql`excluded.details`
              }
            });
        }
        return row;
      });
      if (!updated) return reply.code(404).send({ error: 'not_found' });

      // Checked against the merged row: a PATCH that moves only one of the two
      // dates must still be judged against the other one as it now stands.
      if (
        updated.startsOn !== null &&
        updated.registrationDeadline !== null &&
        updated.registrationDeadline > updated.startsOn
      ) {
        return reply.code(422).send({ error: 'deadline_after_start' });
      }

      const dto = await loadAdminDto(updated.id);
      assert(dto, 'tournament vanished after update');
      return dto;
    }
  );

  admin.delete(
    '/api/admin/tournaments/:id',
    {
      schema: {
        params: ID_PARAMS,
        response: { 200: Type.Object({ deleted: Type.Boolean() }), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      // Registrations cascade, so a delete would silently take the roster with
      // it — refuse while anyone holds a seat and let staff cancel it instead.
      const [live] = await admin.db
        .select({ n: count() })
        .from(tournamentRegistrations)
        .where(
          and(
            eq(tournamentRegistrations.tournamentId, request.params.id),
            ne(tournamentRegistrations.status, 'cancelled')
          )
        );
      if ((live?.n ?? 0) > 0) return reply.code(409).send({ error: 'has_registrations' });

      const [deleted] = await admin.db
        .delete(tournaments)
        .where(eq(tournaments.id, request.params.id))
        .returning({ id: tournaments.id });
      if (!deleted) return reply.code(404).send({ error: 'not_found' });
      return { deleted: true };
    }
  );

  admin.get(
    '/api/admin/tournaments/:id/registrations',
    {
      schema: {
        params: ID_PARAMS,
        querystring: Type.Object({ status: Type.Optional(TOURNAMENT_REGISTRATION_STATUS) }),
        response: { 200: Type.Array(ADMIN_TOURNAMENT_REGISTRATION_RESPONSE) }
      }
    },
    async request => {
      const filters = [eq(tournamentRegistrations.tournamentId, request.params.id)];
      if (request.query.status !== undefined) {
        filters.push(eq(tournamentRegistrations.status, request.query.status));
      }
      const rows = await admin.db
        .select()
        .from(tournamentRegistrations)
        .where(and(...filters))
        // Sign-up order is the queue: first in is first on the bracket
        .orderBy(asc(tournamentRegistrations.createdAt));

      return rows.map(row => ({
        id: row.id,
        tournamentId: row.tournamentId,
        name: row.name,
        phone: row.phone,
        status: row.status,
        userId: row.userId,
        createdAt: row.createdAt.toISOString()
      }));
    }
  );

  admin.post(
    '/api/admin/tournaments/:id/registrations',
    {
      schema: {
        params: ID_PARAMS,
        body: Type.Object(
          {
            name: Type.String({ minLength: 1, maxLength: 80 }),
            phone: Type.String({ minLength: 3, maxLength: 25 }),
            /** Walk-ins pay at the desk there and then, hence the default */
            status: Type.Optional(TOURNAMENT_REGISTRATION_STATUS)
          },
          { additionalProperties: false }
        ),
        response: { 201: ADMIN_TOURNAMENT_REGISTRATION_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const name = request.body.name.trim();
      if (name === '') return reply.code(422).send({ error: 'invalid_name' });
      const phone = normalizePhone(request.body.phone);
      if (phone === null) return reply.code(422).send({ error: 'invalid_phone' });

      const [tournament] = await admin.db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(eq(tournaments.id, request.params.id));
      if (!tournament) return reply.code(404).send({ error: 'not_found' });

      // Staff sign-ups bypass the deadline and the cap on purpose: someone
      // standing at the desk with the fee in hand outranks both.
      const status = request.body.status ?? 'confirmed';
      try {
        const [row] = await admin.db
          .insert(tournamentRegistrations)
          .values({ tournamentId: tournament.id, name, phone, status })
          .returning();
        assert(row, 'insert returned no row');
        return reply.code(201).send({
          id: row.id,
          tournamentId: row.tournamentId,
          name: row.name,
          phone: row.phone,
          status: row.status,
          userId: row.userId,
          createdAt: row.createdAt.toISOString()
        });
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) {
          return reply.code(409).send({ error: 'already_registered' });
        }
        throw err;
      }
    }
  );

  admin.patch(
    '/api/admin/tournaments/:id/registrations/:registrationId',
    {
      schema: {
        params: REGISTRATION_PARAMS,
        body: Type.Object(
          {
            status: Type.Optional(TOURNAMENT_REGISTRATION_STATUS),
            name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 }))
          },
          { additionalProperties: false }
        ),
        response: { 200: ADMIN_TOURNAMENT_REGISTRATION_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const name = cleanText(request.body.name);
      if (name === null) return reply.code(422).send({ error: 'invalid_name' });

      const patch = {
        ...(request.body.status !== undefined ? { status: request.body.status } : {}),
        ...(name !== undefined ? { name } : {})
      };
      if (Object.keys(patch).length === 0) return reply.code(400).send({ error: 'empty_patch' });

      const [row] = await admin.db
        .update(tournamentRegistrations)
        .set(patch)
        .where(
          and(
            eq(tournamentRegistrations.id, request.params.registrationId),
            eq(tournamentRegistrations.tournamentId, request.params.id)
          )
        )
        .returning();
      if (!row) return reply.code(404).send({ error: 'not_found' });

      return {
        id: row.id,
        tournamentId: row.tournamentId,
        name: row.name,
        phone: row.phone,
        status: row.status,
        userId: row.userId,
        createdAt: row.createdAt.toISOString()
      };
    }
  );

  admin.delete(
    '/api/admin/tournaments/:id/registrations/:registrationId',
    {
      schema: {
        params: REGISTRATION_PARAMS,
        response: { 200: Type.Object({ deleted: Type.Boolean() }), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const [deleted] = await admin.db
        .delete(tournamentRegistrations)
        .where(
          and(
            eq(tournamentRegistrations.id, request.params.registrationId),
            eq(tournamentRegistrations.tournamentId, request.params.id)
          )
        )
        .returning({ id: tournamentRegistrations.id });
      if (!deleted) return reply.code(404).send({ error: 'not_found' });
      return { deleted: true };
    }
  );
};
