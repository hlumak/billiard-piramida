import assert from 'node:assert';
import { Type } from 'typebox';
import { count, eq, sql } from 'drizzle-orm';
import { foodItems, foodItemTranslations, orderItems } from '../db/schema.ts';
import { ADMIN_MENU_ITEM_RESPONSE, ERROR_RESPONSE, INT_ID, LOCALE_SCHEMA } from '../lib/schemas.ts';
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from '../lib/errors.ts';
import { insertWithFreeSlug, slugify } from '../lib/slug.ts';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

type FoodItemRow = typeof foodItems.$inferSelect;
type TranslationRow = typeof foodItemTranslations.$inferSelect;

function toAdminMenuItem(item: FoodItemRow, translations: TranslationRow[]) {
  const forItem = translations.filter(t => t.foodItemId === item.id);
  const uk = forItem.find(t => t.locale === 'uk');
  return {
    id: item.id,
    slug: item.slug,
    category: item.category,
    priceGrosz: item.priceGrosz,
    name: uk?.name ?? item.slug,
    description: uk?.description ?? null,
    isAvailable: item.isAvailable,
    translations: forItem.map(t => ({
      locale: t.locale as 'uk' | 'pl' | 'en',
      name: t.name,
      description: t.description
    }))
  };
}

/**
 * The menu, staff side: dishes with their translations, price and availability.
 * Registered inside the admin scope (routes/admin.ts), behind its token hook.
 */
export const adminMenuRoutes: FastifyPluginAsyncTypebox = async admin => {
  // Full menu incl. hidden items — staff view, uk names
  admin.get(
    '/api/admin/menu',
    { schema: { response: { 200: Type.Array(ADMIN_MENU_ITEM_RESPONSE) } } },
    async () => {
      const [items, translations] = await Promise.all([
        admin.db.select().from(foodItems).orderBy(foodItems.category, foodItems.id),
        admin.db.select().from(foodItemTranslations)
      ]);
      return items.map(item => toAdminMenuItem(item, translations));
    }
  );

  // Menu management. Historic orders keep their unit price; deleting is
  // blocked once a dish appears in any order (hide it instead).

  const TRANSLATIONS_BODY = Type.Array(
    Type.Object(
      {
        locale: LOCALE_SCHEMA,
        name: Type.String({ minLength: 1, maxLength: 120 }),
        description: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()]))
      },
      { additionalProperties: false }
    ),
    { minItems: 1, maxItems: 3 }
  );

  admin.post(
    '/api/admin/menu',
    {
      schema: {
        body: Type.Object(
          {
            category: Type.Union([
              Type.Literal('snack'),
              Type.Literal('main'),
              Type.Literal('drink'),
              Type.Literal('dessert')
            ]),
            priceGrosz: Type.Integer({ minimum: 0, maximum: 1_000_00 }),
            translations: TRANSLATIONS_BODY
          },
          { additionalProperties: false }
        ),
        response: { 201: ADMIN_MENU_ITEM_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { category, priceGrosz, translations } = request.body;
      const en = translations.find(t => t.locale === 'en');
      const uk = translations.find(t => t.locale === 'uk');
      const base = slugify((en ?? uk ?? translations[0]!).name, 'dish');

      const created = await admin.db.transaction(async tx => {
        // Unique slug: base, then base-2, base-3… (atomic, see insertWithFreeSlug)
        const item = await insertWithFreeSlug(base, async slug => {
          const [inserted] = await tx
            .insert(foodItems)
            .values({ slug, category, priceGrosz })
            .onConflictDoNothing({ target: foodItems.slug })
            .returning();
          return inserted;
        });
        assert(item, 'insert returned no row');
        await tx.insert(foodItemTranslations).values(
          translations.map(t => ({
            foodItemId: item.id,
            locale: t.locale,
            name: t.name.trim(),
            description: t.description?.trim() || null
          }))
        );
        return item;
      });

      const rows = await admin.db
        .select()
        .from(foodItemTranslations)
        .where(eq(foodItemTranslations.foodItemId, created.id));
      return reply.code(201).send(toAdminMenuItem(created, rows));
    }
  );

  admin.patch(
    '/api/admin/menu/:id',
    {
      schema: {
        params: Type.Object({ id: INT_ID }),
        body: Type.Object(
          {
            isAvailable: Type.Optional(Type.Boolean()),
            priceGrosz: Type.Optional(Type.Integer({ minimum: 0, maximum: 1_000_00 })),
            category: Type.Optional(
              Type.Union([
                Type.Literal('snack'),
                Type.Literal('main'),
                Type.Literal('drink'),
                Type.Literal('dessert')
              ])
            ),
            translations: Type.Optional(TRANSLATIONS_BODY)
          },
          { additionalProperties: false }
        ),
        response: { 200: ADMIN_MENU_ITEM_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { isAvailable, priceGrosz, category, translations } = request.body;
      const patch = {
        ...(isAvailable !== undefined ? { isAvailable } : {}),
        ...(priceGrosz !== undefined ? { priceGrosz } : {}),
        ...(category !== undefined ? { category } : {})
      };
      const updated = await admin.db.transaction(async tx => {
        // A translations-only PATCH touches no food_items column; Drizzle refuses
        // an empty `set`, so read the row instead of updating it (as with news).
        const [item] =
          Object.keys(patch).length > 0
            ? await tx
                .update(foodItems)
                .set(patch)
                .where(eq(foodItems.id, request.params.id))
                .returning()
            : await tx.select().from(foodItems).where(eq(foodItems.id, request.params.id));
        if (!item) return null;
        if (translations !== undefined && translations.length > 0) {
          // One statement for all the locales sent: `excluded` is the row
          // Postgres was about to insert, so each locale updates to its own
          // new copy.
          await tx
            .insert(foodItemTranslations)
            .values(
              translations.map(t => ({
                foodItemId: item.id,
                locale: t.locale,
                name: t.name.trim(),
                description: t.description?.trim() || null
              }))
            )
            .onConflictDoUpdate({
              target: [foodItemTranslations.foodItemId, foodItemTranslations.locale],
              set: { name: sql`excluded.name`, description: sql`excluded.description` }
            });
        }
        return item;
      });
      if (!updated) return reply.code(404).send({ error: 'not_found' });

      const rows = await admin.db
        .select()
        .from(foodItemTranslations)
        .where(eq(foodItemTranslations.foodItemId, updated.id));
      return toAdminMenuItem(updated, rows);
    }
  );

  admin.delete(
    '/api/admin/menu/:id',
    {
      schema: {
        params: Type.Object({ id: INT_ID }),
        response: { 200: Type.Object({ deleted: Type.Boolean() }), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const [{ n } = { n: 0 }] = await admin.db
        .select({ n: count() })
        .from(orderItems)
        .where(eq(orderItems.foodItemId, request.params.id));
      if (n > 0) return reply.code(409).send({ error: 'has_orders' });

      // Translations cascade via FK
      try {
        const [deleted] = await admin.db
          .delete(foodItems)
          .where(eq(foodItems.id, request.params.id))
          .returning({ id: foodItems.id });
        if (!deleted) return reply.code(404).send({ error: 'not_found' });
      } catch (err) {
        // An order inserted between the count() and the delete makes the delete
        // violate order_items' FK — report it as has_orders, not a 500.
        if (pgErrorCode(err) === FOREIGN_KEY_VIOLATION) {
          return reply.code(409).send({ error: 'has_orders' });
        }
        throw err;
      }
      return { deleted: true };
    }
  );

  // News carousel on the home screen. Nothing references these rows, so
  // deletes need no guard — but hiding beats deleting for a promo that may
  // come back, hence isPublished.
};
