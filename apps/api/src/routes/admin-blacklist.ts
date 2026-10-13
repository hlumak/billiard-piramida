import assert from 'node:assert';
import { Type } from 'typebox';
import type { AdminBlacklistEntryDto } from '@repo/shared';
import { normalizePhone } from '@repo/shared/phone';
import { and, count, desc, eq, inArray, max } from 'drizzle-orm';
import { blacklist, bookings } from '../db/schema.ts';
import { ADMIN_BLACKLIST_ENTRY_RESPONSE, ERROR_RESPONSE } from '../lib/schemas.ts';
import type { Db } from '../db/client.ts';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

/** Newest first, each with the name and no-show history its bookings carry. */
async function loadEntries(db: Db, onlyPhone?: string): Promise<AdminBlacklistEntryDto[]> {
  const rows = await db
    .select()
    .from(blacklist)
    .where(onlyPhone === undefined ? undefined : eq(blacklist.phone, onlyPhone))
    .orderBy(desc(blacklist.createdAt));
  if (rows.length === 0) return [];

  const phones = rows.map(row => row.phone);
  const [history, names] = await Promise.all([
    db
      .select({
        phone: bookings.customerPhone,
        noShowCount: count(),
        lastNoShowAt: max(bookings.startsAt)
      })
      .from(bookings)
      .where(and(eq(bookings.status, 'no_show'), inArray(bookings.customerPhone, phones)))
      .groupBy(bookings.customerPhone),
    db
      .selectDistinctOn([bookings.customerPhone], {
        phone: bookings.customerPhone,
        name: bookings.customerName
      })
      .from(bookings)
      .where(inArray(bookings.customerPhone, phones))
      .orderBy(bookings.customerPhone, desc(bookings.startsAt))
  ]);
  const historyByPhone = new Map(history.map(h => [h.phone, h]));
  const nameByPhone = new Map(names.map(n => [n.phone, n.name]));

  return rows.map(row => {
    const past = historyByPhone.get(row.phone);
    return {
      phone: row.phone,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      bookingId: row.bookingId,
      name: nameByPhone.get(row.phone) ?? null,
      noShowCount: past?.noShowCount ?? 0,
      lastNoShowAt: past?.lastNoShowAt?.toISOString() ?? null
    };
  });
}

/**
 * The black list: numbers that may not book online because the client booked
 * and did not come. Marking a booking as a no-show adds the number (see
 * admin-bookings.ts); staff can also add one by hand, or remove one to forgive.
 * Registered inside the admin scope (routes/admin.ts), behind its token hook.
 */
export const adminBlacklistRoutes: FastifyPluginAsyncTypebox = async admin => {
  admin.get(
    '/api/admin/blacklist',
    { schema: { response: { 200: Type.Array(ADMIN_BLACKLIST_ENTRY_RESPONSE) } } },
    async () => loadEntries(admin.db)
  );

  admin.post(
    '/api/admin/blacklist',
    {
      schema: {
        body: Type.Object(
          {
            phone: Type.String({ minLength: 5, maxLength: 25 }),
            note: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()]))
          },
          { additionalProperties: false }
        ),
        response: { 201: ADMIN_BLACKLIST_ENTRY_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const phone = normalizePhone(request.body.phone);
      if (phone === null) return reply.code(422).send({ error: 'invalid_phone' });
      const inserted = await admin.db
        .insert(blacklist)
        .values({ phone, reason: 'manual', note: request.body.note?.trim() || null })
        .onConflictDoNothing()
        .returning({ phone: blacklist.phone });
      if (inserted.length === 0) return reply.code(409).send({ error: 'already_blacklisted' });
      const [entry] = await loadEntries(admin.db, phone);
      assert(entry, 'inserted entry not found');
      return reply.code(201).send(entry);
    }
  );

  admin.delete(
    '/api/admin/blacklist/:phone',
    {
      schema: {
        params: Type.Object({ phone: Type.String({ minLength: 5, maxLength: 25 }) }),
        response: { 200: Type.Object({ deleted: Type.Boolean() }), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const phone = normalizePhone(request.params.phone);
      if (phone === null) return reply.code(422).send({ error: 'invalid_phone' });
      const deleted = await admin.db
        .delete(blacklist)
        .where(eq(blacklist.phone, phone))
        .returning({ phone: blacklist.phone });
      if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' });
      return { deleted: true };
    }
  );
};
