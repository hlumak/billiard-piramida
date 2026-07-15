import { Type } from '@sinclair/typebox';
import type { UserProfileDto } from '@repo/shared';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.ts';
import { normalizePhone } from '@repo/shared/phone';
import { hashPassword, verifyPassword } from '../lib/passwords.ts';
import {
  AUTH_RESPONSE,
  ERROR_RESPONSE,
  PROFILE_RESPONSE,
  SPORT_CARD_TYPE
} from '../lib/schemas.ts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppInstance } from '../app.ts';

const CREDENTIALS = {
  phone: Type.String({ minLength: 5, maxLength: 25 }),
  password: Type.String({ minLength: 8, maxLength: 100 })
};

const CARD_FIELDS = {
  sportCardType: Type.Optional(Type.Union([SPORT_CARD_TYPE, Type.Null()])),
  sportCardNumber: Type.Optional(Type.Union([Type.String({ maxLength: 40 }), Type.Null()])),
  clubCardNumber: Type.Optional(Type.Union([Type.String({ maxLength: 40 }), Type.Null()]))
};

const REGISTER_BODY = Type.Object(
  {
    ...CREDENTIALS,
    name: Type.String({ minLength: 1, maxLength: 120 }),
    ...CARD_FIELDS
  },
  { additionalProperties: false }
);

const LOGIN_BODY = Type.Object(CREDENTIALS, { additionalProperties: false });

const UPDATE_BODY = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    ...CARD_FIELDS
  },
  { additionalProperties: false }
);

function toProfile(user: typeof users.$inferSelect): UserProfileDto {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    sportCardType: user.sportCardType,
    sportCardNumber: user.sportCardNumber,
    clubCardNumber: user.clubCardNumber
  };
}

export function authRoutes(app: AppInstance, authEnabled: boolean) {
  const guard = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!authEnabled) {
      return reply.code(503).send({ error: 'auth_disabled' });
    }
    return undefined;
  };

  app.post(
    '/api/auth/register',
    {
      preHandler: guard,
      schema: {
        body: REGISTER_BODY,
        response: { 201: AUTH_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { password, name, sportCardType, sportCardNumber, clubCardNumber } = request.body;
      const phone = normalizePhone(request.body.phone);
      if (phone === null) return reply.code(400).send({ error: 'invalid_phone' });
      const passwordHash = await hashPassword(password);

      const [existing] = await app.db.select().from(users).where(eq(users.phone, phone));
      if (existing) return reply.code(409).send({ error: 'phone_taken' });

      const [created] = await app.db
        .insert(users)
        .values({
          phone,
          name: name.trim(),
          passwordHash,
          sportCardType: sportCardType ?? null,
          sportCardNumber: sportCardNumber ?? null,
          clubCardNumber: clubCardNumber ?? null
        })
        .returning();
      if (!created) throw new Error('insert returned no row');

      const token = await reply.jwtSign({ sub: created.id });
      return reply.code(201).send({ token, profile: toProfile(created) });
    }
  );

  app.post(
    '/api/auth/login',
    {
      preHandler: guard,
      schema: { body: LOGIN_BODY, response: { 200: AUTH_RESPONSE, '4xx': ERROR_RESPONSE } }
    },
    async (request, reply) => {
      // Same normalization as registration, so any input format matches
      const normalized = normalizePhone(request.body.phone) ?? request.body.phone.trim();
      const [user] = await app.db.select().from(users).where(eq(users.phone, normalized));
      // Verify against a dummy hash when the user is missing — uniform timing
      const valid = user
        ? await verifyPassword(request.body.password, user.passwordHash)
        : (await hashPassword(request.body.password), false);
      if (!user || !valid) return reply.code(401).send({ error: 'invalid_credentials' });

      const token = await reply.jwtSign({ sub: user.id });
      return { token, profile: toProfile(user) };
    }
  );

  app.get(
    '/api/auth/me',
    {
      preHandler: guard,
      schema: { response: { 200: PROFILE_RESPONSE, '4xx': ERROR_RESPONSE } }
    },
    async (request, reply) => {
      const user = await app.authenticatedUser(request);
      if (!user) return reply.code(401).send({ error: 'unauthorized' });
      return toProfile(user);
    }
  );

  app.patch(
    '/api/auth/me',
    {
      preHandler: guard,
      schema: { body: UPDATE_BODY, response: { 200: PROFILE_RESPONSE, '4xx': ERROR_RESPONSE } }
    },
    async (request, reply) => {
      const user = await app.authenticatedUser(request);
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const { name, sportCardType, sportCardNumber, clubCardNumber } = request.body;
      const [updated] = await app.db
        .update(users)
        .set({
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(sportCardType !== undefined ? { sportCardType } : {}),
          ...(sportCardNumber !== undefined ? { sportCardNumber } : {}),
          ...(clubCardNumber !== undefined ? { clubCardNumber } : {})
        })
        .where(eq(users.id, user.id))
        .returning();
      if (!updated) return reply.code(404).send({ error: 'not_found' });
      return toProfile(updated);
    }
  );
}
