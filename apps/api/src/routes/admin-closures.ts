import { Type, type Static } from 'typebox';
import {
  isIsoDate,
  MAX_CLOSURE_DAYS,
  MAX_CLOSURE_REASON_LENGTH,
  MAX_SPOT_ID,
  type ClosureDto
} from '@repo/shared';
import { eq } from 'drizzle-orm';
import { closures, tables } from '../db/schema.ts';
import {
  CLOSURE_CONFLICT_RESPONSE,
  CLOSURE_RESPONSE,
  ERROR_RESPONSE,
  ISO_DATE,
  UUID
} from '../lib/schemas.ts';
import { HOUR_MS, warsawInstant } from '../lib/time.ts';
import {
  datesTouched,
  findClosureConflicts,
  loadUpcomingClosures,
  lockClosuresExclusive,
  toClosureDto
} from '../services/closures.ts';
import type { Db } from '../db/client.ts';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

const HOUR = Type.Integer({ minimum: 0, maximum: 23 });

const CLOSURE_BODY = Type.Object(
  {
    startDate: ISO_DATE,
    startHour: HOUR,
    endDate: ISO_DATE,
    endHour: HOUR,
    tableIds: Type.Union([
      Type.Array(Type.Integer({ minimum: 1, maximum: MAX_SPOT_ID }), {
        minItems: 1,
        maxItems: 50,
        uniqueItems: true
      }),
      Type.Null()
    ]),
    reason: Type.Union([Type.String({ maxLength: MAX_CLOSURE_REASON_LENGTH }), Type.Null()])
  },
  { additionalProperties: false }
);

type ClosureBody = Static<typeof CLOSURE_BODY>;

type Parsed =
  | { ok: true; startsAt: Date; endsAt: Date; tableIds: number[] | null; reason: string | null }
  | { ok: false; error: string };

/** The wall-clock span staff entered, as instants, checked against the room. */
async function parseClosure(db: Pick<Db, 'select'>, body: ClosureBody): Promise<Parsed> {
  if (!isIsoDate(body.startDate) || !isIsoDate(body.endDate)) {
    return { ok: false, error: 'invalid_date' };
  }
  const startsAt = warsawInstant(body.startDate, body.startHour);
  const endsAt = warsawInstant(body.endDate, body.endHour);
  if (endsAt <= startsAt) return { ok: false, error: 'invalid_closure' };
  if (endsAt.getTime() - startsAt.getTime() > MAX_CLOSURE_DAYS * 24 * HOUR_MS) {
    return { ok: false, error: 'closure_too_long' };
  }
  if (body.tableIds !== null) {
    const known = new Set((await db.select({ id: tables.id }).from(tables)).map(t => t.id));
    if (body.tableIds.some(id => !known.has(id))) return { ok: false, error: 'unknown_table' };
  }
  const reason = body.reason?.trim() || null;
  return { ok: true, startsAt, endsAt, tableIds: body.tableIds, reason };
}

/**
 * Closing the club, or some spots, for a while. A closure never lands on a
 * booking: the write is refused while any confirmed one is in its way, and
 * staff move or cancel those first (the conflicts endpoint lists them as the
 * form is filled in). Registered inside the admin scope, behind its token.
 */
export const adminClosureRoutes: FastifyPluginAsyncTypebox = async admin => {
  /** Guests see the change at once: availability grids and the venue config. */
  const announce = (...ranges: { startsAt: Date; endsAt: Date }[]) => {
    admin.venueConfig.invalidate();
    const dates = new Set(ranges.flatMap(r => datesTouched(r.startsAt, r.endsAt)));
    for (const date of dates) admin.availabilityHub.notify(date);
  };

  admin.get(
    '/api/admin/closures',
    { schema: { response: { 200: Type.Array(CLOSURE_RESPONSE) } } },
    async (): Promise<ClosureDto[]> =>
      (await loadUpcomingClosures(admin.db, { clubOnly: false })).map(toClosureDto)
  );

  admin.get(
    '/api/admin/closures/conflicts',
    {
      schema: {
        querystring: Type.Object({
          startDate: ISO_DATE,
          startHour: HOUR,
          endDate: ISO_DATE,
          endHour: HOUR,
          /** Comma-separated spot ids; absent closes the whole club */
          tableIds: Type.Optional(Type.String({ pattern: '^\\d{1,3}(,\\d{1,3}){0,49}$' }))
        }),
        response: { 200: Type.Array(CLOSURE_CONFLICT_RESPONSE), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { tableIds, ...when } = request.query;
      const parsed = await parseClosure(admin.db, {
        ...when,
        tableIds: tableIds === undefined ? null : [...new Set(tableIds.split(',').map(Number))],
        reason: null
      });
      if (!parsed.ok) return reply.code(422).send({ error: parsed.error });
      return findClosureConflicts(admin.db, parsed.startsAt, parsed.endsAt, parsed.tableIds);
    }
  );

  /** Insert or replace under the exclusive lock, refusing while bookings stand in the way. */
  const save = async (
    body: ClosureBody,
    id: string | null
  ): Promise<
    | { ok: true; row: typeof closures.$inferSelect; previous: typeof closures.$inferSelect | null }
    | { ok: false; status: 404 | 409 | 422; error: string }
  > => {
    const parsed = await parseClosure(admin.db, body);
    if (!parsed.ok) return { ok: false, status: 422, error: parsed.error };
    if (id === null && parsed.endsAt.getTime() <= Date.now()) {
      return { ok: false, status: 422, error: 'closure_in_past' };
    }
    const values = {
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      tableIds: parsed.tableIds,
      reason: parsed.reason
    };
    return admin.db.transaction(async tx => {
      await lockClosuresExclusive(tx);
      const conflicts = await findClosureConflicts(
        tx,
        parsed.startsAt,
        parsed.endsAt,
        parsed.tableIds
      );
      if (conflicts.length > 0) {
        return { ok: false as const, status: 409 as const, error: 'closure_conflicts' };
      }
      if (id === null) {
        const [row] = await tx.insert(closures).values(values).returning();
        if (!row) throw new Error('insert returned no row');
        return { ok: true as const, row, previous: null };
      }
      const [previous] = await tx.select().from(closures).where(eq(closures.id, id));
      if (!previous) return { ok: false as const, status: 404 as const, error: 'not_found' };
      const [row] = await tx.update(closures).set(values).where(eq(closures.id, id)).returning();
      if (!row) throw new Error('update returned no row');
      return { ok: true as const, row, previous };
    });
  };

  admin.post(
    '/api/admin/closures',
    {
      schema: {
        body: CLOSURE_BODY,
        response: { 201: CLOSURE_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const result = await save(request.body, null);
      if (!result.ok) return reply.code(result.status).send({ error: result.error });
      announce(result.row);
      return reply.code(201).send(toClosureDto(result.row));
    }
  );

  admin.put(
    '/api/admin/closures/:id',
    {
      schema: {
        params: Type.Object({ id: UUID }),
        body: CLOSURE_BODY,
        response: { 200: CLOSURE_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const result = await save(request.body, request.params.id);
      if (!result.ok) return reply.code(result.status).send({ error: result.error });
      announce(result.row, ...(result.previous ? [result.previous] : []));
      return toClosureDto(result.row);
    }
  );

  /** Opening again: no lock needed, freeing time can't collide with a booking. */
  admin.delete(
    '/api/admin/closures/:id',
    {
      schema: {
        params: Type.Object({ id: UUID }),
        response: { 200: Type.Object({ deleted: Type.Boolean() }), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const [removed] = await admin.db
        .delete(closures)
        .where(eq(closures.id, request.params.id))
        .returning();
      if (!removed) return reply.code(404).send({ error: 'not_found' });
      announce(removed);
      return { deleted: true };
    }
  );
};
